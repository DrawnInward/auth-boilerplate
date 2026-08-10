import bcrypt from "bcrypt";
import { TOTP, Secret } from "otpauth";
import { PoolClient } from "pg";
import {
  createMfaService,
  MfaService,
  MfaStore,
  MfaChallengeGate,
  SafeUser,
  SessionPrincipal,
} from "../../src/services";
import { httpError } from "../../src/utils/httpError";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const BACKUP_CODE = "ABCD-1234";

const totpCode = () =>
  new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(TEST_SECRET),
  }).generate();

type StoreState = {
  enabled: boolean;
  secret: string | null;
  backupCodes: { id: string; code_hash: string; used_at: string | null }[];
};

type ChallengeState = Map<string, { consumed: boolean; failed: number }>;

describe("mfaService", () => {
  let state: StoreState;
  let challengeState: ChallengeState;
  let userRow: (SafeUser & { password_hash?: string | null }) | null;
  let consumeCalls: { jti: string | undefined; client: unknown }[];
  let failedJtis: (string | undefined)[];
  let issueCalls: { principal: SessionPrincipal; client: unknown }[];
  let emailsSent: string[];
  let backupHash: string;
  let mfa: MfaService<SafeUser>;

  const txClient = { transaction: true } as unknown as PoolClient;

  const mintChallenge = (
    roleType: "user" | "admin" = "user",
    jti = "jti-1",
  ): string => {
    challengeState.set(jti, { consumed: false, failed: 0 });
    return JSON.stringify({
      role_id: USER_ID,
      role_type: roleType,
      type: "mfa_challenge",
      jti,
    });
  };

  const makeStore = (): MfaStore => ({
    getMfaStatus: async () => ({
      mfa_enabled: state.enabled,
      mfa_secret: state.secret,
    }),
    getMfaSecret: async () => state.secret,
    setMfaSecret: async (_id, _role, secret) => {
      state.secret = secret;
    },
    enableMfa: async () => {
      state.enabled = true;
    },
    disableMfa: async () => {
      state.enabled = false;
      state.secret = null;
    },
    createBackupCodes: async (_id, _role, hashedCodes) => {
      state.backupCodes.push(
        ...hashedCodes.map((code_hash, i) => ({
          id: `bc-${state.backupCodes.length + i}`,
          code_hash,
          used_at: null,
        })),
      );
    },
    getUnusedBackupCodes: async () =>
      state.backupCodes
        .filter((c) => c.used_at === null)
        .map((c) => ({
          ...c,
          role_id: USER_ID,
          role_type: "user" as const,
          created_at: "now",
        })),
    getBackupCodeCount: async () =>
      state.backupCodes.filter((c) => c.used_at === null).length,
    markBackupCodeUsed: async (codeId) => {
      const code = state.backupCodes.find((c) => c.id === codeId);
      if (code) code.used_at = "now";
    },
    deleteAllBackupCodes: async () => {
      state.backupCodes = [];
    },
  });

  const makeChallenges = (): MfaChallengeGate => ({
    verifyToken: (token) => JSON.parse(token),
    guard: async (jti) => {
      const challenge = jti ? challengeState.get(jti) : undefined;
      if (!challenge || challenge.consumed || challenge.failed >= 5) {
        throw httpError(401, "Invalid MFA challenge token");
      }
    },
    fail: async (jti) => {
      failedJtis.push(jti);
      const challenge = jti ? challengeState.get(jti) : undefined;
      if (challenge) challenge.failed += 1;
    },
    consumeOrThrow: async (jti, client) => {
      consumeCalls.push({ jti, client });
      const challenge = jti ? challengeState.get(jti) : undefined;
      if (!challenge || challenge.consumed) {
        throw httpError(401, "Invalid MFA challenge token");
      }
      challenge.consumed = true;
    },
  });

  beforeAll(async () => {
    backupHash = await bcrypt.hash(BACKUP_CODE, 4);
  });

  beforeEach(() => {
    state = { enabled: false, secret: null, backupCodes: [] };
    challengeState = new Map();
    consumeCalls = [];
    failedJtis = [];
    issueCalls = [];
    emailsSent = [];
    userRow = {
      user_id: USER_ID,
      email: "alice@example.com",
      is_active: true,
      password_hash: null,
    };

    mfa = createMfaService<SafeUser>({
      roleType: "user",
      principals: {
        getById: async () => userRow,
        getWithPasswordById: async () => userRow,
        toSessionPrincipal: (user) => ({
          role_type: "user",
          role_id: user.user_id!,
          is_active: user.is_active === true,
          email_verified: true,
        }),
      },
      store: makeStore(),
      challenges: makeChallenges(),
      // Models the real withTransaction for the one write the fakes track:
      // a throw inside the callback rolls the challenge-state back.
      runTransaction: async (fn) => {
        const snapshot = new Map(
          [...challengeState].map(([k, v]) => [k, { ...v }] as const),
        );
        try {
          return await fn(txClient);
        } catch (err) {
          challengeState.clear();
          for (const [k, v] of snapshot) {
            challengeState.set(k, v);
          }
          throw err;
        }
      },
      issueSession: async (principal, client) => {
        issueCalls.push({ principal, client });
        if (!principal.is_active) {
          throw httpError(403, "Account is deactivated");
        }
        return { accessToken: "access", refreshToken: "refresh" };
      },
      email: {
        sendMfaEnabled: async (to) => {
          emailsSent.push(`enabled:${to}`);
        },
        sendMfaDisabled: async (to) => {
          emailsSent.push(`disabled:${to}`);
        },
      },
    });
  });

  const enrolled = (overrides: Partial<StoreState> = {}) => {
    state.enabled = true;
    state.secret = TEST_SECRET;
    state.backupCodes = [{ id: "bc-0", code_hash: backupHash, used_at: null }];
    Object.assign(state, overrides);
  };

  describe("beginTotpSetup", () => {
    it("refuses a missing principal with the role's noun", async () => {
      userRow = null;
      await expect(mfa.beginTotpSetup(USER_ID)).rejects.toMatchObject({
        status: 404,
        message: "User not found",
      });
    });

    it("refuses when MFA is already enabled", async () => {
      enrolled();
      await expect(mfa.beginTotpSetup(USER_ID)).rejects.toMatchObject({
        status: 400,
        message: "MFA is already enabled",
      });
    });

    it("stores a fresh secret and returns the QR data URL", async () => {
      const { qrCodeDataUrl } = await mfa.beginTotpSetup(USER_ID);
      expect(qrCodeDataUrl).toContain("data:image/png;base64");
      expect(state.secret).toBeTruthy();
      expect(state.enabled).toBe(false);
    });
  });

  describe("confirmTotpSetup", () => {
    it("refuses before setup has stored a secret", async () => {
      await expect(
        mfa.confirmTotpSetup(USER_ID, "000000"),
      ).rejects.toMatchObject({
        status: 400,
        message: "MFA setup not initiated",
      });
    });

    it("refuses a wrong code and leaves MFA disabled", async () => {
      state.secret = TEST_SECRET;
      await expect(
        mfa.confirmTotpSetup(USER_ID, "000000"),
      ).rejects.toMatchObject({
        status: 401,
        message: "Invalid verification code",
      });
      expect(state.enabled).toBe(false);
      expect(emailsSent).toEqual([]);
    });

    it("enables MFA, issues ten backup codes and emails the account", async () => {
      state.secret = TEST_SECRET;
      const codes = await mfa.confirmTotpSetup(USER_ID, totpCode());

      expect(codes).toHaveLength(10);
      expect(state.enabled).toBe(true);
      expect(state.backupCodes).toHaveLength(10);
      expect(emailsSent).toEqual(["enabled:alice@example.com"]);
      // Returned codes are the plaintext of the stored hashes.
      await expect(
        bcrypt.compare(codes[0], state.backupCodes[0].code_hash),
      ).resolves.toBe(true);
    });
  });

  describe("verifyTotp", () => {
    it("refuses when MFA is not set up", async () => {
      await expect(mfa.verifyTotp(USER_ID, "000000")).rejects.toMatchObject({
        status: 400,
        message: "MFA not enabled",
      });
    });

    it("accepts a current code and refuses a wrong one", async () => {
      enrolled();
      await expect(
        mfa.verifyTotp(USER_ID, totpCode()),
      ).resolves.toBeUndefined();
      await expect(mfa.verifyTotp(USER_ID, "000000")).rejects.toMatchObject({
        status: 401,
        message: "Invalid verification code",
      });
    });
  });

  describe("disable", () => {
    beforeEach(async () => {
      enrolled();
      userRow!.password_hash = await bcrypt.hash("Password1", 4);
    });

    it("refuses a passwordless account", async () => {
      userRow!.password_hash = null;
      await expect(
        mfa.disable(USER_ID, totpCode(), "whatever"),
      ).rejects.toMatchObject({
        status: 400,
        message: "No password set. Use set-password endpoint instead.",
      });
    });

    it("refuses a wrong password before looking at the code, MFA intact", async () => {
      await expect(
        mfa.disable(USER_ID, totpCode(), "wrong"),
      ).rejects.toMatchObject({ status: 401, message: "Invalid password" });
      expect(state.enabled).toBe(true);
      expect(emailsSent).toEqual([]);
    });

    it("refuses a wrong code with the password correct", async () => {
      await expect(
        mfa.disable(USER_ID, "000000", "Password1"),
      ).rejects.toMatchObject({ status: 401, message: "Invalid code" });
      expect(state.enabled).toBe(true);
    });

    it("disables via TOTP, wipes backup codes and emails the account", async () => {
      await mfa.disable(USER_ID, totpCode(), "Password1");
      expect(state.enabled).toBe(false);
      expect(state.secret).toBeNull();
      expect(state.backupCodes).toEqual([]);
      expect(emailsSent).toEqual(["disabled:alice@example.com"]);
    });

    it("disables via a backup code", async () => {
      await mfa.disable(USER_ID, BACKUP_CODE, "Password1");
      expect(state.enabled).toBe(false);
    });
  });

  describe("verifyBackupCode", () => {
    it("consumes a matching code exactly once", async () => {
      enrolled();
      await mfa.verifyBackupCode(USER_ID, BACKUP_CODE);
      expect(state.backupCodes[0].used_at).not.toBeNull();

      await expect(
        mfa.verifyBackupCode(USER_ID, BACKUP_CODE),
      ).rejects.toMatchObject({ status: 401, message: "Invalid backup code" });
    });

    it("refuses when MFA is not enabled", async () => {
      await expect(
        mfa.verifyBackupCode(USER_ID, BACKUP_CODE),
      ).rejects.toMatchObject({ status: 400, message: "MFA is not enabled" });
    });
  });

  describe("regenerateBackupCodes", () => {
    it("refuses a wrong code and keeps the old set", async () => {
      enrolled();
      await expect(
        mfa.regenerateBackupCodes(USER_ID, "000000"),
      ).rejects.toMatchObject({
        status: 401,
        message: "Invalid verification code",
      });
      expect(state.backupCodes).toHaveLength(1);
    });

    it("replaces the whole set for a valid code", async () => {
      enrolled();
      const codes = await mfa.regenerateBackupCodes(USER_ID, totpCode());
      expect(codes).toHaveLength(10);
      expect(state.backupCodes).toHaveLength(10);
      await expect(
        mfa.verifyBackupCode(USER_ID, BACKUP_CODE),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe("getStatus", () => {
    it("reports disabled with zero codes without counting", async () => {
      await expect(mfa.getStatus(USER_ID)).resolves.toEqual({
        mfa_enabled: false,
        backup_codes_remaining: 0,
      });
    });

    it("reports the unused-code count when enabled", async () => {
      enrolled();
      state.backupCodes.push({ id: "bc-1", code_hash: "x", used_at: "now" });
      await expect(mfa.getStatus(USER_ID)).resolves.toEqual({
        mfa_enabled: true,
        backup_codes_remaining: 1,
      });
    });
  });

  describe("completeLoginWithTotp", () => {
    beforeEach(() => enrolled());

    it("refuses a missing challenge token", async () => {
      await expect(
        mfa.completeLoginWithTotp(undefined, totpCode()),
      ).rejects.toMatchObject({
        status: 401,
        message: "MFA challenge not found",
      });
    });

    it("refuses a challenge minted for the other role", async () => {
      await expect(
        mfa.completeLoginWithTotp(mintChallenge("admin"), totpCode()),
      ).rejects.toMatchObject({
        status: 401,
        message: "Invalid MFA challenge",
      });
      expect(issueCalls).toEqual([]);
    });

    it("records the failure and refuses a wrong code", async () => {
      const token = mintChallenge();
      await expect(
        mfa.completeLoginWithTotp(token, "000000"),
      ).rejects.toMatchObject({
        status: 401,
        message: "Invalid verification code",
      });
      expect(failedJtis).toEqual(["jti-1"]);
      expect(consumeCalls).toEqual([]);
    });

    it("refuses a consumed challenge before the code is even checked", async () => {
      const token = mintChallenge();
      challengeState.get("jti-1")!.consumed = true;
      await expect(
        mfa.completeLoginWithTotp(token, totpCode()),
      ).rejects.toMatchObject({ status: 401 });
      expect(issueCalls).toEqual([]);
    });

    it("consumes the challenge, notifies the caller, and issues the session", async () => {
      const consumedAt: string[] = [];
      const { principal, tokens } = await mfa.completeLoginWithTotp(
        mintChallenge(),
        totpCode(),
        () => consumedAt.push("cookie-cleared"),
      );

      expect(consumedAt).toEqual(["cookie-cleared"]);
      expect(principal).toBe(userRow);
      expect(tokens).toEqual({
        accessToken: "access",
        refreshToken: "refresh",
      });
      expect(issueCalls[0].principal).toEqual({
        role_type: "user",
        role_id: USER_ID,
        is_active: true,
        email_verified: true,
      });
    });

    it("rolls the consume back and keeps the cookie when issuance refuses a deactivated principal", async () => {
      // Consume and issue are one transaction now (a transient failure after
      // a correct code must not burn the challenge), so a principal refusal
      // rolls the consume back too. The live-but-useless challenge is inert:
      // issueSession structurally refuses it on every retry until expiry.
      userRow!.is_active = false;
      let callbackFired = false;

      await expect(
        mfa.completeLoginWithTotp(mintChallenge(), totpCode(), () => {
          callbackFired = true;
        }),
      ).rejects.toMatchObject({ status: 403 });

      expect(callbackFired).toBe(false);
      expect(challengeState.get("jti-1")!.consumed).toBe(false);
    });
  });

  describe("completeLoginWithBackupCode", () => {
    beforeEach(() => enrolled());

    it("records the failure and leaves the code unspent on a wrong code", async () => {
      await expect(
        mfa.completeLoginWithBackupCode(mintChallenge(), "WRONGCODE1"),
      ).rejects.toMatchObject({ status: 401, message: "Invalid backup code" });
      expect(failedJtis).toEqual(["jti-1"]);
      expect(state.backupCodes[0].used_at).toBeNull();
    });

    it("spends the code and consumes the challenge inside the transaction", async () => {
      const { tokens } = await mfa.completeLoginWithBackupCode(
        mintChallenge(),
        BACKUP_CODE,
      );

      expect(tokens.accessToken).toBe("access");
      expect(state.backupCodes[0].used_at).not.toBeNull();
      expect(consumeCalls[0]).toEqual({ jti: "jti-1", client: txClient });
      expect(issueCalls[0].client).toBe(txClient);
    });
  });
});
