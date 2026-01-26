import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName, getFrontendUrl } from "../../config";

export async function sendOrgInviteEmail(
  email: string,
  token: string,
  organizationName: string,
  role: string,
  inviterEmail?: string
): Promise<void> {
  const acceptUrl = `${getFrontendUrl()}/accept-invite/${token}`;
  const appName = getAppName();

  const inviterText = inviterEmail ? `${inviterEmail} has` : "You have been";

  // Plain text includes URL for non-HTML email clients
  const text = `You're invited to join ${organizationName}

${inviterText} invited you to join "${organizationName}" as a ${role} on ${appName}.

Click the link below to accept the invitation:

${acceptUrl}

This invitation will expire in 7 days.

If you don't want to join this organization, you can safely ignore this email.`;

  // HTML version - no URL text, just the button
  const htmlText = `You're invited to join ${organizationName}

${inviterText} invited you to join "${organizationName}" as a ${role} on ${appName}.

Click the button below to accept the invitation.

This invitation will expire in 7 days.

If you don't want to join this organization, you can safely ignore this email.`;

  const html = textToHtml(htmlText, {
    links: [{ url: acceptUrl, text: "Accept Invitation" }],
  });

  await sendEmail({
    to: email,
    subject: `You're invited to join ${organizationName} - ${appName}`,
    text,
    html,
  });
}
