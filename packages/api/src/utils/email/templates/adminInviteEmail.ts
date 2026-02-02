import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName, getFrontendUrl } from "../../config";

export async function sendAdminInviteEmail(
  email: string,
  token: string,
): Promise<void> {
  const setupUrl = `${getFrontendUrl()}/complete-registration?token=${token}`;
  const appName = getAppName();

  const text = `Welcome to ${appName}!

An administrator has created an account for you.

Please click the link below to set your password and activate your account:

${setupUrl}

This link will expire in 7 days.

If you weren't expecting this invitation, you can safely ignore this email.`;

  const htmlText = `Welcome to ${appName}!

An administrator has created an account for you.

Please click the button below to set your password and activate your account.

This link will expire in 7 days.

If you weren't expecting this invitation, you can safely ignore this email.`;

  const html = textToHtml(htmlText, {
    links: [{ url: setupUrl, text: "Set Up Account" }],
  });

  await sendEmail({
    to: email,
    subject: `You've been invited to ${appName}`,
    text,
    html,
  });
}
