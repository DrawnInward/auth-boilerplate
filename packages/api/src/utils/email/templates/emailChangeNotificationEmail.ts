import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface EmailChangeNotificationEmailParams {
  /** The current address, warned that a change was requested. */
  to: string;
  newEmail: string;
  appName: string;
}

export function buildEmailChangeNotificationEmail({
  to,
  newEmail,
  appName,
}: EmailChangeNotificationEmailParams): EmailOptions {
  const text = `Email Change Request

Someone has requested to change your ${appName} account email address to ${newEmail}.

If this was you, you can ignore this message. The change will only take effect after verification from the new email address.

If you did not request this change, please secure your account immediately by changing your password.`;

  return {
    to,
    subject: `Email change requested - ${appName}`,
    text,
    html: textToHtml(text, { appName }),
  };
}
