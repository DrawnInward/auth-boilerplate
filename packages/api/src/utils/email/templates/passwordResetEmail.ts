import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface PasswordResetEmailParams {
  to: string;
  token: string;
  appName: string;
  frontendUrl: string;
}

export function buildPasswordResetEmail({
  to,
  token,
  appName,
  frontendUrl,
}: PasswordResetEmailParams): EmailOptions {
  const resetUrl = `${frontendUrl}/reset-password/${token}`;

  // Plain text includes URL for non-HTML email clients
  const text = `Password Reset Request

You requested to reset your password for ${appName}.

Click the link below to set a new password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.`;

  // HTML version - no URL text, just the button
  const htmlText = `Password Reset Request

You requested to reset your password for ${appName}.

Click the button below to set a new password.

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.`;

  return {
    to,
    subject: `Reset your password - ${appName}`,
    text,
    html: textToHtml(htmlText, {
      appName,
      links: [{ url: resetUrl, text: "Reset Password" }],
    }),
  };
}
