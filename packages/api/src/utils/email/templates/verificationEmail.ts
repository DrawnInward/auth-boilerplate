import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface VerificationEmailParams {
  to: string;
  token: string;
  appName: string;
  frontendUrl: string;
}

export function buildVerificationEmail({
  to,
  token,
  appName,
  frontendUrl,
}: VerificationEmailParams): EmailOptions {
  const verifyUrl = `${frontendUrl}/verify-email/${token}`;

  // Plain text includes URL for non-HTML email clients
  const text = `Welcome to ${appName}!

Please verify your email address by clicking the link below:

${verifyUrl}

This link will expire in 24 hours.

If you didn't create an account with ${appName}, you can safely ignore this email.`;

  // HTML version - no URL text, just the button
  const htmlText = `Welcome to ${appName}!

Please verify your email address by clicking the button below.

This link will expire in 24 hours.

If you didn't create an account with ${appName}, you can safely ignore this email.`;

  return {
    to,
    subject: `Verify your email - ${appName}`,
    text,
    html: textToHtml(htmlText, {
      appName,
      links: [{ url: verifyUrl, text: "Verify Email" }],
    }),
  };
}
