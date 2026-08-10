/**
 * Application configuration helpers.
 * Centralized access to common environment variables.
 */

import { readPositiveNumberEnv } from "./envNumber";
import { httpError } from "./httpError";

export const getAppName = (): string => process.env.APP_NAME || "App";

// Both keys are checked at boot by validateEnv, so a miss here means the
// environment changed under a running process; callers surface it as the
// opaque 500 it has always been.
export const getAccessKey = (roleType: "user" | "admin"): string => {
  const key =
    roleType === "admin"
      ? process.env.ADMIN_ACCESS_KEY
      : process.env.USER_ACCESS_KEY;
  if (!key) {
    throw httpError(500, "Server configuration error");
  }
  return key;
};

export const getAllowedOrigin = (): string =>
  process.env.ALLOWED_ORIGIN || "http://localhost:5173";

export const getFrontendUrl = (): string =>
  process.env.FRONTEND_URL || getAllowedOrigin();

export type AccountCreationMode = "open" | "invite_only" | "admin_only";
export type OrgCreationMode = "open" | "self_registered_only" | "admin_only";

const validAccountModes: AccountCreationMode[] = [
  "open",
  "invite_only",
  "admin_only",
];
const validOrgModes: OrgCreationMode[] = [
  "open",
  "self_registered_only",
  "admin_only",
];

export const getAccountCreationMode = (): AccountCreationMode => {
  const mode = process.env.ACCOUNT_CREATION_MODE as AccountCreationMode;
  if (mode && validAccountModes.includes(mode)) {
    return mode;
  }
  return "open";
};

export const getOrgCreationMode = (): OrgCreationMode => {
  const mode = process.env.ORG_CREATION_MODE as OrgCreationMode;
  if (mode && validOrgModes.includes(mode)) {
    return mode;
  }
  return "open";
};

const REFRESH_TOKEN_DAYS_DEFAULT = 7;

// Shares envNumber's notion of "well-formed positive integer" with the boot
// check in validateEnv, so a value this silently falls back on is a value the
// process would have refused to start with.
export const getRefreshTokenDays = (): number =>
  readPositiveNumberEnv("REFRESH_TOKEN_DAYS", { integer: true }) ??
  REFRESH_TOKEN_DAYS_DEFAULT;

const REFRESH_REUSE_GRACE_SECONDS_DEFAULT = 30;

// The reuse-interval (leeway) for rotated refresh tokens. A token presented
// again within this window of being rotated is a concurrent or retried exchange
// — not a replay — and is honoured without revoking the session; outside it, a
// reused token trips breach detection. 30s matches Auth0/Okta defaults. Capped
// at 300: the value is SECONDS (the getter converts to ms), and a units typo
// like 30000 would otherwise silently disable breach detection for the life of
// any session. See docs/hardening-plan.md A1.
export const getRefreshReuseGraceMs = (): number =>
  (readPositiveNumberEnv("REFRESH_REUSE_GRACE_SECONDS", {
    integer: true,
    min: 1,
    max: 300,
  }) ?? REFRESH_REUSE_GRACE_SECONDS_DEFAULT) * 1000;

const ACCESS_TOKEN_LIFETIME_SECONDS_DEFAULT = 15 * 60;

// How long a minted access token (and its cookie) lives. Because authoriseUser
// is deliberately stateless, this is also the upper bound on how long a
// disabled or logged-out session keeps working — a deployment wanting a
// tighter revocation window shrinks this knob and pays with refresh traffic.
export const getAccessTokenLifetimeSeconds = (): number =>
  readPositiveNumberEnv("ACCESS_TOKEN_LIFETIME_SECONDS", { integer: true }) ??
  ACCESS_TOKEN_LIFETIME_SECONDS_DEFAULT;

// OWASP's current bcrypt minimum. Overridable so a deployment can trade
// hashing latency against hardware (BCRYPT_COST=4 makes test runs cheap).
// Bounded to bcrypt's own valid range (4–31): boot validation refuses anything
// outside it, and this read site falls back to the default rather than hash
// with a cost that would take effectively forever.
const BCRYPT_COST_DEFAULT = 12;

export const getBcryptCost = (): number =>
  readPositiveNumberEnv("BCRYPT_COST", { integer: true, min: 4, max: 31 }) ??
  BCRYPT_COST_DEFAULT;
