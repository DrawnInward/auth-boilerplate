// Session issuance in one place. Every path that turns a proven identity into
// auth tokens goes through this service, so "did we check is_active and MFA?"
// has a structural answer rather than a remembered-per-call-site one:
// issueSession refuses a deactivated principal, and startSession will not mint
// tokens while the account has MFA enabled — it issues a challenge instead.
//
// The DB writes (the refresh row, the MFA challenge row) arrive as
// dependencies, so unit tests drive the branching with in-memory fakes, and a
// caller already inside withTransaction threads its client straight through.

import jwt from "jsonwebtoken";
import { Pool, PoolClient } from "pg";
import db from "../database/db";
import { CreateRefreshTokenDto } from "../types";
import { getAccessTokenLifetimeSeconds } from "../utils/config";
import { httpError } from "../utils/httpError";
import { isAccountActive } from "../utils/isAccountActive";

// The principal carries exactly what its access token claims, plus is_active —
// callers state where each claim came from (a row, or a fact the flow itself
// establishes, e.g. email_verified after an emailed-token registration).
export type SessionPrincipal =
  | {
      role_type: "user";
      role_id: string;
      is_active: boolean;
      email_verified: boolean;
    }
  | { role_type: "admin"; role_id: string; is_active: boolean; root: boolean };

export type MfaCheckedPrincipal = SessionPrincipal & { mfa_enabled: boolean };

export type SessionTokens = { accessToken: string; refreshToken: string };

export type SessionStart =
  | { kind: "mfa_required"; challengeToken: string }
  | ({ kind: "session" } & SessionTokens);

export type AuthServiceDeps = {
  /** Returns the signing key for the role; throws the 500 a missing key is. */
  getAccessKey: (roleType: "user" | "admin") => string;
  addRefresh: (
    newRefresh: CreateRefreshTokenDto,
    client?: PoolClient | Pool,
  ) => Promise<{ token: string; refresh_id: string }>;
  createMfaChallengeToken: (
    roleId: string,
    roleType: "user" | "admin",
    client?: PoolClient | Pool,
  ) => Promise<string>;
};

export type AuthService = {
  /**
   * Mint an access/refresh pair for a principal whose second factor (if any)
   * has already been satisfied. Refuses a deactivated account.
   */
  issueSession(
    principal: SessionPrincipal,
    client?: PoolClient | Pool,
  ): Promise<SessionTokens>;
  /**
   * The front door for password/OAuth/invitation flows: deactivated → 403,
   * MFA enabled → challenge token, otherwise a full session.
   */
  startSession(
    principal: MfaCheckedPrincipal,
    client?: PoolClient | Pool,
  ): Promise<SessionStart>;
};

const accessClaims = (principal: SessionPrincipal) =>
  principal.role_type === "admin"
    ? {
        role_id: principal.role_id,
        role_type: "admin",
        root: principal.root,
      }
    : {
        role_id: principal.role_id,
        role_type: "user",
        email_verified: principal.email_verified,
      };

export const createAuthService = ({
  getAccessKey,
  addRefresh,
  createMfaChallengeToken,
}: AuthServiceDeps): AuthService => {
  const issueSession = async (
    principal: SessionPrincipal,
    client: PoolClient | Pool = db,
  ): Promise<SessionTokens> => {
    if (!isAccountActive(principal)) {
      throw httpError(403, "Account is deactivated");
    }

    const accessToken = jwt.sign(
      accessClaims(principal),
      getAccessKey(principal.role_type),
      { expiresIn: getAccessTokenLifetimeSeconds() },
    );

    const { token: refreshToken } = await addRefresh(
      { role_id: principal.role_id, role_type: principal.role_type },
      client,
    );

    return { accessToken, refreshToken };
  };

  const startSession = async (
    principal: MfaCheckedPrincipal,
    client: PoolClient | Pool = db,
  ): Promise<SessionStart> => {
    // The MFA branch deliberately comes before any deactivation check.
    // Deactivation is enforced where it matters — issueSession, which every
    // verify path routes through — so even if a caller starts a challenge for
    // a deactivated account, a session can never come of it. (Today's callers
    // all refuse deactivated principals before calling this — login, accept
    // and the OAuth callback gate, pinned by their suites.)
    if (principal.mfa_enabled) {
      const challengeToken = await createMfaChallengeToken(
        principal.role_id,
        principal.role_type,
        client,
      );
      return { kind: "mfa_required", challengeToken };
    }

    return { kind: "session", ...(await issueSession(principal, client)) };
  };

  return { issueSession, startSession };
};
