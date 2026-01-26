import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName, getFrontendUrl } from "../../config";

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${getFrontendUrl()}/verify-email/${token}`;
  const appName = getAppName();

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

  const html = textToHtml(htmlText, {
    links: [{ url: verifyUrl, text: "Verify Email" }],
  });

  await sendEmail({
    to: email,
    subject: `Verify your email - ${appName}`,
    text,
    html,
  });
}
