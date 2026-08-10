import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { Response } from "express";
import { Pool, PoolClient } from "pg";
import db from "../database/db";
import { createCookieOptions } from "./createCookieOptions";
import { httpError } from "./httpError";
import {
  createMfaChallenge,
  getMfaChallengeByJti,
  consumeMfaChallenge,
  incrementMfaChallengeAttempts,
  deleteExpiredMfaChallenges,
} from "../models/mfaChallenges.models";

export interface MfaChallengePayload {
  role_id: string;
  role_type: "user" | "admin";
  type: "mfa_challenge";
  jti: string;
}

const MFA_CHALLENGE_EXPIRY = "5m";
const MFA_CHALLENGE_MAX_AGE = 5 * 60 * 1000;

export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

// Persisting the jti here, not at the call sites, is what makes S9 hold at
// every current and future challenge issuer: a challenge that isn't recorded
// can never be verified.
export async function createMfaChallengeToken(
  roleId: string,
  roleType: "user" | "admin",
  client: PoolClient | Pool = db,
): Promise<string> {
  const key = process.env.MFA_CHALLENGE_KEY;
  if (!key) {
    throw httpError(500, "MFA_CHALLENGE_KEY not configured");
  }

  const jti = randomUUID();

  // Opportunistic GC — fire-and-forget on the POOL, never the caller's
  // client: a table-wide DELETE inside a business transaction (invitation
  // accept, OAuth) would hold GC row locks until that commit. Expiry is
  // enforced read-side (guard + consume predicates) regardless.
  void deleteExpiredMfaChallenges().catch(() => {});

  await createMfaChallenge(
    {
      jti,
      role_id: roleId,
      role_type: roleType,
      ttl_seconds: MFA_CHALLENGE_MAX_AGE / 1000,
    },
    client,
  );

  return jwt.sign(
    { role_id: roleId, role_type: roleType, type: "mfa_challenge" },
    key,
    { expiresIn: MFA_CHALLENGE_EXPIRY, jwtid: jti },
  );
}

export function verifyMfaChallengeToken(token: string): MfaChallengePayload {
  const key = process.env.MFA_CHALLENGE_KEY;
  if (!key) {
    throw httpError(500, "MFA_CHALLENGE_KEY not configured");
  }

  try {
    const payload = jwt.verify(token, key) as MfaChallengePayload;
    if (payload.type !== "mfa_challenge") {
      throw httpError(401, "Invalid MFA challenge token");
    }
    return payload;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw httpError(401, "MFA challenge expired");
    }
    throw httpError(401, "Invalid MFA challenge token");
  }
}

// Call after verifying the JWT, before checking the submitted code: rejects a
// challenge that was never recorded, is already consumed, or has exhausted
// its attempts. The signature alone no longer authorises a verify.
export async function guardMfaChallenge(
  jti: string | undefined,
  client: PoolClient | Pool = db,
): Promise<void> {
  const challenge = jti ? await getMfaChallengeByJti(jti, client) : null;
  if (
    !challenge ||
    challenge.is_expired ||
    challenge.consumed_at !== null ||
    challenge.failed_attempts >= MFA_CHALLENGE_MAX_ATTEMPTS
  ) {
    throw httpError(401, "Invalid MFA challenge token");
  }
}

// The caller is about to throw, so this write must survive the surrounding
// rollback: run it on the pool — but ONLY from a call site that is not
// holding a transaction client (acquiring a second connection while holding
// one is the pool-wedge shape). Callers that hold a client must fail the
// challenge before opening their transaction. The increment is capped in
// SQL, so concurrent failures can never grow the budget past the cap.
export async function failMfaChallenge(jti: string | undefined): Promise<void> {
  if (jti) {
    await incrementMfaChallengeAttempts(jti, MFA_CHALLENGE_MAX_ATTEMPTS);
  }
}

// Single-use enforcement: the compare-and-set means of two concurrent
// verifies with a valid code, exactly one issues a session.
export async function consumeMfaChallengeOrThrow(
  jti: string | undefined,
  client: PoolClient | Pool = db,
): Promise<void> {
  const consumed = jti
    ? await consumeMfaChallenge(jti, MFA_CHALLENGE_MAX_ATTEMPTS, client)
    : null;
  if (!consumed) {
    throw httpError(401, "Invalid MFA challenge token");
  }
}

export function setMfaChallengeCookie(res: Response, token: string): void {
  const cookieOptions = createCookieOptions(MFA_CHALLENGE_MAX_AGE, {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
  });
  res.cookie("mfa_challenge", token, cookieOptions);
}

export function clearMfaChallengeCookie(res: Response): void {
  const cookieOptions = createCookieOptions(0, {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
  });
  res.cookie("mfa_challenge", "", cookieOptions);
}
