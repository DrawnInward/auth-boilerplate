import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface OrgInviteEmailParams {
  to: string;
  token: string;
  organizationName: string;
  role: string;
  inviterEmail?: string;
  appName: string;
  frontendUrl: string;
}

export function buildOrgInviteEmail({
  to,
  token,
  organizationName,
  role,
  inviterEmail,
  appName,
  frontendUrl,
}: OrgInviteEmailParams): EmailOptions {
  const acceptUrl = `${frontendUrl}/invitations/${token}`;

  // The whole clause, not just its subject: the two branches need different
  // verb forms ("X has invited you" vs "You have been invited").
  const invitedClause = inviterEmail
    ? `${inviterEmail} has invited you`
    : "You have been invited";

  // Plain text includes URL for non-HTML email clients
  const text = `You're invited to join ${organizationName}

${invitedClause} to join "${organizationName}" as a ${role} on ${appName}.

Click the link below to accept the invitation:

${acceptUrl}

This invitation will expire in 7 days.

If you don't want to join this organization, you can safely ignore this email.`;

  // HTML version - no URL text, just the button
  const htmlText = `You're invited to join ${organizationName}

${invitedClause} to join "${organizationName}" as a ${role} on ${appName}.

Click the button below to accept the invitation.

This invitation will expire in 7 days.

If you don't want to join this organization, you can safely ignore this email.`;

  return {
    to,
    subject: `You're invited to join ${organizationName} - ${appName}`,
    text,
    html: textToHtml(htmlText, {
      appName,
      links: [{ url: acceptUrl, text: "Accept Invitation" }],
    }),
  };
}
