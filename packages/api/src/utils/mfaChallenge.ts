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

  await deleteExpiredMfaChallenges(client);
  await createMfaChallenge(
    {
      jti,
      role_id: roleId,
      role_type: roleType,
      expires_at: new Date(Date.now() + MFA_CHALLENGE_MAX_AGE),
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
    challenge.consumed_at !== null ||
    challenge.failed_attempts >= MFA_CHALLENGE_MAX_ATTEMPTS
  ) {
    throw httpError(401, "Invalid MFA challenge token");
  }
}

// Deliberately on the pool, never a transaction client: the caller is about
// to throw, and a rollback must not erase the failed-attempt count.
export async function failMfaChallenge(jti: string | undefined): Promise<void> {
  if (jti) {
    await incrementMfaChallengeAttempts(jti);
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
