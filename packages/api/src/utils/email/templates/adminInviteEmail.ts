import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface AdminInviteEmailParams {
  to: string;
  token: string;
  appName: string;
  frontendUrl: string;
}

export function buildAdminInviteEmail({
  to,
  token,
  appName,
  frontendUrl,
}: AdminInviteEmailParams): EmailOptions {
  const setupUrl = `${frontendUrl}/complete-registration?token=${token}`;

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

  return {
    to,
    subject: `You've been invited to ${appName}`,
    text,
    html: textToHtml(htmlText, {
      appName,
      links: [{ url: setupUrl, text: "Set Up Account" }],
    }),
  };
}
