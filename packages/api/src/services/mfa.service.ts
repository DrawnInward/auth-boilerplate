// The user and admin MFA flows are one machine addressed at two tables:
// written once here, instantiated per role, with the role differences
// (principal lookups, session-claim mapping) arriving as dependencies.

import bcrypt from "bcrypt";
import { Pool, PoolClient } from "pg";
import type * as mfaModels from "../models/mfa.models";
import { RoleType, BackupCode } from "../models/mfa.models";
import { generateTotpSecret, verifyTotpCode } from "../utils/totp";
import { generateBackupCodes, hashBackupCodes } from "../utils/backupCodes";
import { httpError } from "../utils/httpError";
import { MfaChallengePayload } from "../utils/mfaChallenge";
import { AuthService, SessionPrincipal, SessionTokens } from "./auth.service";

export type MfaStore = Pick<
  typeof mfaModels,
  | "getMfaStatus"
  | "getMfaSecret"
  | "setMfaSecret"
  | "enableMfa"
  | "disableMfa"
  | "createBackupCodes"
  | "getUnusedBackupCodes"
  | "getBackupCodeCount"
  | "markBackupCodeUsed"
  | "deleteAllBackupCodes"
>;

export type MfaChallengeGate = {
  verifyToken(token: string): MfaChallengePayload;
  guard(jti: string | undefined, client?: PoolClient | Pool): Promise<void>;
  fail(jti: string | undefined): Promise<void>;
  consumeOrThrow(
    jti: string | undefined,
    client?: PoolClient | Pool,
  ): Promise<void>;
};

export type MfaPrincipalSource<P> = {
  getById(roleId: string): Promise<P | null>;
  getWithPasswordById(
    roleId: string,
  ): Promise<(P & { password_hash?: string | null }) | null>;
  /** Maps a freshly-loaded row to the claims an MFA login completion issues. */
  toSessionPrincipal(principal: P): SessionPrincipal;
};

export type MfaServiceDeps<P> = {
  roleType: RoleType;
  principals: MfaPrincipalSource<P>;
  store: MfaStore;
  challenges: MfaChallengeGate;
  runTransaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  issueSession: AuthService["issueSession"];
  email: {
    sendMfaEnabled(to: string): Promise<void>;
    sendMfaDisabled(to: string): Promise<void>;
  };
};

export type MfaStatusSummary = {
  mfa_enabled: boolean;
  backup_codes_remaining: number;
};

export type MfaLoginResult<P> = { principal: P; tokens: SessionTokens };

export type MfaService<P> = {
  beginTotpSetup(roleId: string): Promise<{ qrCodeDataUrl: string }>;
  confirmTotpSetup(roleId: string, code: string): Promise<string[]>;
  verifyTotp(roleId: string, code: string): Promise<void>;
  disable(roleId: string, code: string, password: string): Promise<void>;
  verifyBackupCode(roleId: string, code: string): Promise<void>;
  regenerateBackupCodes(roleId: string, code: string): Promise<string[]>;
  getStatus(roleId: string): Promise<MfaStatusSummary>;
  /**
   * Complete a login challenge with a TOTP code / a backup code.
   * `onChallengeConsumed` fires the moment the challenge is spent, before the
   * principal is re-loaded and a session attempted — so the caller can drop
   * the challenge cookie even when issuance then refuses (e.g. deactivated).
   */
  completeLoginWithTotp(
    challengeToken: string | undefined,
    code: string,
    onChallengeConsumed?: () => void,
  ): Promise<MfaLoginResult<P>>;
  completeLoginWithBackupCode(
    challengeToken: string | undefined,
    code: string,
    onChallengeConsumed?: () => void,
  ): Promise<MfaLoginResult<P>>;
};

export const createMfaService = <P extends { email: string }>({
  roleType,
  principals,
  store,
  challenges,
  runTransaction,
  issueSession,
  email,
}: MfaServiceDeps<P>): MfaService<P> => {
  const noun = roleType === "user" ? "User" : "Admin";

  const getPrincipalOrThrow = async (roleId: string): Promise<P> => {
    const principal = await principals.getById(roleId);
    if (!principal) {
      throw httpError(404, `${noun} not found`);
    }
    return principal;
  };

  const requireMfaEnabled = async (roleId: string, client?: PoolClient) => {
    const mfaStatus = await store.getMfaStatus(roleId, roleType, client);
    if (!mfaStatus?.mfa_enabled) {
      throw httpError(400, "MFA is not enabled");
    }
  };

  const rotateBackupCodes = async (
    roleId: string,
    client: PoolClient,
  ): Promise<string[]> => {
    await store.deleteAllBackupCodes(roleId, roleType, client);
    const codes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(codes);
    await store.createBackupCodes(roleId, roleType, hashedCodes, client);
    return codes;
  };

  const findMatchingBackupCode = async (
    roleId: string,
    code: string,
    client?: PoolClient,
  ): Promise<BackupCode | null> => {
    const unusedCodes = await store.getUnusedBackupCodes(
      roleId,
      roleType,
      client,
    );
    for (const backupCode of unusedCodes) {
      if (await bcrypt.compare(code, backupCode.code_hash)) {
        return backupCode;
      }
    }
    return null;
  };

  const openChallenge = (
    challengeToken: string | undefined,
  ): MfaChallengePayload => {
    if (!challengeToken) {
      throw httpError(401, "MFA challenge not found");
    }
    const payload = challenges.verifyToken(challengeToken);
    if (payload.role_type !== roleType) {
      throw httpError(401, "Invalid MFA challenge");
    }
    return payload;
  };

  const beginTotpSetup = async (roleId: string) => {
    const principal = await getPrincipalOrThrow(roleId);

    const mfaStatus = await store.getMfaStatus(roleId, roleType);
    if (mfaStatus?.mfa_enabled) {
      throw httpError(400, "MFA is already enabled");
    }

    const { secret, qrCodeDataUrl } = await generateTotpSecret(principal.email);
    await store.setMfaSecret(roleId, roleType, secret);

    return { qrCodeDataUrl };
  };

  const confirmTotpSetup = async (roleId: string, code: string) => {
    const principal = await getPrincipalOrThrow(roleId);

    const backupCodes = await runTransaction(async (client) => {
      const mfaStatus = await store.getMfaStatus(roleId, roleType, client);
      if (mfaStatus?.mfa_enabled) {
        throw httpError(400, "MFA is already enabled");
      }

      const secret = await store.getMfaSecret(roleId, roleType, client);
      if (!secret) {
        throw httpError(400, "MFA setup not initiated");
      }

      if (!verifyTotpCode(secret, code)) {
        throw httpError(401, "Invalid verification code");
      }

      await store.enableMfa(roleId, roleType, client);
      return rotateBackupCodes(roleId, client);
    });

    await email.sendMfaEnabled(principal.email);

    return backupCodes;
  };

  const verifyTotp = async (roleId: string, code: string) => {
    const secret = await store.getMfaSecret(roleId, roleType);
    if (!secret) {
      throw httpError(400, "MFA not enabled");
    }

    if (!verifyTotpCode(secret, code)) {
      throw httpError(401, "Invalid verification code");
    }
  };

  const disable = async (roleId: string, code: string, password: string) => {
    const principal = await principals.getWithPasswordById(roleId);
    if (!principal) {
      throw httpError(404, `${noun} not found`);
    }

    // S8: disabling a second factor is a step-up operation — the account
    // password is required alongside a current code, so a stolen session
    // plus one leaked backup code cannot silently remove MFA.
    if (!principal.password_hash) {
      throw httpError(
        400,
        "No password set. Use set-password endpoint instead.",
      );
    }
    if (!(await bcrypt.compare(password, principal.password_hash))) {
      throw httpError(401, "Invalid password");
    }

    await runTransaction(async (client) => {
      await requireMfaEnabled(roleId, client);

      const secret = await store.getMfaSecret(roleId, roleType, client);
      let verified = Boolean(secret && verifyTotpCode(secret, code));

      if (!verified) {
        const backupCode = await findMatchingBackupCode(roleId, code, client);
        if (backupCode) {
          verified = true;
          await store.markBackupCodeUsed(backupCode.id, client);
        }
      }

      if (!verified) {
        throw httpError(401, "Invalid code");
      }

      await store.disableMfa(roleId, roleType, client);
      await store.deleteAllBackupCodes(roleId, roleType, client);
    });

    await email.sendMfaDisabled(principal.email);
  };

  const verifyBackupCode = async (roleId: string, code: string) => {
    await runTransaction(async (client) => {
      await requireMfaEnabled(roleId, client);

      const backupCode = await findMatchingBackupCode(roleId, code, client);
      if (!backupCode) {
        throw httpError(401, "Invalid backup code");
      }

      await store.markBackupCodeUsed(backupCode.id, client);
    });
  };

  const regenerateBackupCodes = async (roleId: string, code: string) =>
    runTransaction(async (client) => {
      await requireMfaEnabled(roleId, client);

      const secret = await store.getMfaSecret(roleId, roleType, client);
      if (!secret || !verifyTotpCode(secret, code)) {
        throw httpError(401, "Invalid verification code");
      }

      return rotateBackupCodes(roleId, client);
    });

  const getStatus = async (roleId: string): Promise<MfaStatusSummary> => {
    const mfaStatus = await store.getMfaStatus(roleId, roleType);
    const backupCodeCount = mfaStatus?.mfa_enabled
      ? await store.getBackupCodeCount(roleId, roleType)
      : 0;

    return {
      mfa_enabled: mfaStatus?.mfa_enabled || false,
      backup_codes_remaining: backupCodeCount,
    };
  };

  const completeLoginWithTotp = async (
    challengeToken: string | undefined,
    code: string,
    onChallengeConsumed?: () => void,
  ): Promise<MfaLoginResult<P>> => {
    const payload = openChallenge(challengeToken);
    await challenges.guard(payload.jti);

    const secret = await store.getMfaSecret(payload.role_id, roleType);
    if (!secret) {
      throw httpError(400, "MFA not configured");
    }

    if (!verifyTotpCode(secret, code)) {
      await challenges.fail(payload.jti);
      throw httpError(401, "Invalid verification code");
    }

    const principal = await getPrincipalOrThrow(payload.role_id);

    // Consume and mint atomically — a transient failure after a correct
    // code must not leave the challenge burned with no session issued.
    const tokens = await runTransaction(async (client) => {
      await challenges.consumeOrThrow(payload.jti, client);
      return issueSession(principals.toSessionPrincipal(principal), client);
    });
    onChallengeConsumed?.();

    return { principal, tokens };
  };

  const completeLoginWithBackupCode = async (
    challengeToken: string | undefined,
    code: string,
    onChallengeConsumed?: () => void,
  ): Promise<MfaLoginResult<P>> => {
    const payload = openChallenge(challengeToken);

    // On the pool, before the transaction opens: the guard is a fail-fast
    // pre-check, the CAS consume below is the enforcement.
    await challenges.guard(payload.jti);

    // The bcrypt loop, the fail-count write and the principal read all run
    // before the transaction: a pool write while holding a client is the
    // pool-wedge shape (every wrong-code request would pin one connection
    // and queue for a second), and the hash loop must not pin one either.
    const backupCode = await findMatchingBackupCode(payload.role_id, code);
    if (!backupCode) {
      await challenges.fail(payload.jti);
      throw httpError(401, "Invalid backup code");
    }

    const principal = await getPrincipalOrThrow(payload.role_id);

    return runTransaction(async (client) => {
      await store.markBackupCodeUsed(backupCode.id, client);
      await challenges.consumeOrThrow(payload.jti, client);
      onChallengeConsumed?.();

      const tokens = await issueSession(
        principals.toSessionPrincipal(principal),
        client,
      );

      return { principal, tokens };
    });
  };

  return {
    beginTotpSetup,
    confirmTotpSetup,
    verifyTotp,
    disable,
    verifyBackupCode,
    regenerateBackupCodes,
    getStatus,
    completeLoginWithTotp,
    completeLoginWithBackupCode,
  };
};
