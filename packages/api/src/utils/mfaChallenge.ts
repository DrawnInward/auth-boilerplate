import jwt from "jsonwebtoken";
import { Response } from "express";
import { createCookieOptions } from "./createCookieOptions";
import { httpError } from "./httpError";

export interface MfaChallengePayload {
  role_id: string;
  role_type: "user" | "admin";
  type: "mfa_challenge";
}

const MFA_CHALLENGE_EXPIRY = "5m";
const MFA_CHALLENGE_MAX_AGE = 5 * 60 * 1000;

export function createMfaChallengeToken(
  roleId: string,
  roleType: "user" | "admin"
): string {
  const key = process.env.MFA_CHALLENGE_KEY;
  if (!key) {
    throw httpError(500, "MFA_CHALLENGE_KEY not configured");
  }

  return jwt.sign(
    { role_id: roleId, role_type: roleType, type: "mfa_challenge" },
    key,
    { expiresIn: MFA_CHALLENGE_EXPIRY }
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
