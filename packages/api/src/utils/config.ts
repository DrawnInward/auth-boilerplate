/**
 * Application configuration helpers.
 * Centralized access to common environment variables.
 */

export const getAppName = (): string => process.env.APP_NAME || "App";

export const getFrontendUrl = (): string =>
  process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN || "http://localhost:5173";
