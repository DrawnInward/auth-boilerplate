import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface AdminRegistrationInviteEmailParams {
  to: string;
  token: string;
  appName: string;
  frontendUrl: string;
}

export function buildAdminRegistrationInviteEmail({
  to,
  token,
  appName,
  frontendUrl,
}: AdminRegistrationInviteEmailParams): EmailOptions {
  const setupUrl = `${frontendUrl}/admin/complete-registration?token=${token}`;

  const text = `You've been invited to administer ${appName}.

Please click the link below to set your password and activate your
administrator account:

${setupUrl}

This link will expire in 7 days.

If you weren't expecting this invitation, you can safely ignore this email.`;

  const htmlText = `You've been invited to administer ${appName}.

Please click the button below to set your password and activate your
administrator account.

This link will expire in 7 days.

If you weren't expecting this invitation, you can safely ignore this email.`;

  return {
    to,
    subject: `You've been invited to administer ${appName}`,
    text,
    html: textToHtml(htmlText, {
      appName,
      links: [{ url: setupUrl, text: "Set Up Admin Account" }],
    }),
  };
}
