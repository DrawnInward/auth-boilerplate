/**
 * Email utility for sending transactional emails.
 *
 * In development/test mode, emails are logged to console.
 * In production, configure an email provider via environment variables.
 *
 * Supported providers:
 * - console (default for dev/test)
 * - sendgrid (requires @sendgrid/mail package and SENDGRID_API_KEY)
 *
 * Environment variables:
 * - EMAIL_PROVIDER: "console" | "sendgrid" (defaults to console in dev)
 * - EMAIL_FROM: Sender email address
 * - EMAIL_FROM_NAME: Sender display name
 * - FRONTEND_URL: Base URL for email links
 * - APP_NAME: Application name for branding
 */

// Core
export { sendEmail } from "./sendEmail";
export { textToHtml } from "./textToHtml";
export { getEmailProvider } from "./providers";

// Templates
export {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrgInviteEmail,
} from "./templates";

// Types (re-exported for convenience)
export { EmailOptions, ClickableLink } from "../../interfaces/email";
