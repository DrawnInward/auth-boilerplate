import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName, getFrontendUrl } from "../../config";

export async function sendPasswordResetEmail(
  email: string,
  token: string,
): Promise<void> {
  const resetUrl = `${getFrontendUrl()}/reset-password/${token}`;
  const appName = getAppName();

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

  const html = textToHtml(htmlText, {
    links: [{ url: resetUrl, text: "Reset Password" }],
  });

  await sendEmail({
    to: email,
    subject: `Reset your password - ${appName}`,
    text,
    html,
  });
}
