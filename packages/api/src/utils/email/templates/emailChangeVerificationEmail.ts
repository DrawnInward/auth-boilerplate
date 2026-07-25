import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface EmailChangeVerificationEmailParams {
  /** The proposed new address — this email goes there, not to the old one. */
  to: string;
  token: string;
  appName: string;
  frontendUrl: string;
}

export function buildEmailChangeVerificationEmail({
  to,
  token,
  appName,
  frontendUrl,
}: EmailChangeVerificationEmailParams): EmailOptions {
  const verifyUrl = `${frontendUrl}/confirm-email-change/${token}`;

  const text = `Email Change Request

You requested to change your email address for ${appName} to this email.

Click the link below to confirm the change:

${verifyUrl}

This link will expire in 24 hours.

If you didn't request this change, you can safely ignore this email.`;

  const htmlText = `Email Change Request

You requested to change your email address for ${appName} to this email.

Click the button below to confirm the change.

This link will expire in 24 hours.

If you didn't request this change, you can safely ignore this email.`;

  return {
    to,
    subject: `Confirm your new email - ${appName}`,
    text,
    html: textToHtml(htmlText, {
      appName,
      links: [{ url: verifyUrl, text: "Confirm Email Change" }],
    }),
  };
}
