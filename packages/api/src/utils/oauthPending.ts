import jwt from "jsonwebtoken";
import { httpError } from "./httpError";

// The pending-link cookie names which Google identity will be bound to an
// account, and the (unauthenticated) link route trusts it. Signing it — rather
// than the bare base64 it used to be — is what stops a caller forging someone
// else's google_id onto their own account and hijacking that person's future
// Google sign-ins. Falls back to MFA_CHALLENGE_KEY (a required secret) so a
// default install needs no extra env; set OAUTH_STATE_KEY to separate the keys.
// (S3)

export interface OauthPendingPayload {
  google_id: string;
  email: string;
  type: "oauth_pending";
}

const OAUTH_PENDING_EXPIRY = "10m";

const signingKey = (): string => {
  const key = process.env.OAUTH_STATE_KEY || process.env.MFA_CHALLENGE_KEY;
  if (!key) {
    throw httpError(500, "OAUTH_STATE_KEY / MFA_CHALLENGE_KEY not configured");
  }
  return key;
};

export function signOauthPending(googleId: string, email: string): string {
  return jwt.sign(
    { google_id: googleId, email, type: "oauth_pending" },
    signingKey(),
    { expiresIn: OAUTH_PENDING_EXPIRY },
  );
}

export function verifyOauthPending(token: string): OauthPendingPayload {
  try {
    const payload = jwt.verify(token, signingKey()) as OauthPendingPayload;
    if (payload.type !== "oauth_pending") {
      throw httpError(400, "Invalid pending Google link");
    }
    return payload;
  } catch (err: any) {
    // Rethrow our own httpErrors (500 misconfig, 400 wrong type); a bad
    // signature / expiry / malformed token becomes a 400.
    if (err?.status) throw err;
    throw httpError(400, "Invalid pending Google link");
  }
}
