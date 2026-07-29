/**
 * Application configuration helpers.
 * Centralized access to common environment variables.
 */

import { readPositiveNumberEnv } from "./envNumber";

export const getAppName = (): string => process.env.APP_NAME || "App";

export const getFrontendUrl = (): string =>
  process.env.FRONTEND_URL ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:5173";

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
// reused token trips breach detection. 30s matches Auth0/Okta defaults. See
// docs/hardening-plan.md A1.
export const getRefreshReuseGraceMs = (): number =>
  (readPositiveNumberEnv("REFRESH_REUSE_GRACE_SECONDS", { integer: true }) ??
    REFRESH_REUSE_GRACE_SECONDS_DEFAULT) * 1000;
