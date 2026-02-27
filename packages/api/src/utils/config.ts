/**
 * Application configuration helpers.
 * Centralized access to common environment variables.
 */

export const getAppName = (): string => process.env.APP_NAME || "App";

export const getFrontendUrl = (): string =>
  process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN || "http://localhost:5173";

export type AccountCreationMode = "open" | "invite_only" | "admin_only";
export type OrgCreationMode = "open" | "self_registered_only" | "admin_only";

const validAccountModes: AccountCreationMode[] = ["open", "invite_only", "admin_only"];
const validOrgModes: OrgCreationMode[] = ["open", "self_registered_only", "admin_only"];

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

export const getRefreshTokenDays = (): number => {
  const days = parseInt(process.env.REFRESH_TOKEN_DAYS || "7");
  return isNaN(days) ? 7 : days;
};
