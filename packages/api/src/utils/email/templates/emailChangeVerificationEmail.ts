import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName, getFrontendUrl } from "../../config";

export async function sendEmailChangeVerificationEmail(
  newEmail: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${getFrontendUrl()}/confirm-email-change/${token}`;
  const appName = getAppName();

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

  const html = textToHtml(htmlText, {
    links: [{ url: verifyUrl, text: "Confirm Email Change" }],
  });

  await sendEmail({
    to: newEmail,
    subject: `Confirm your new email - ${appName}`,
    text,
    html,
  });
}
