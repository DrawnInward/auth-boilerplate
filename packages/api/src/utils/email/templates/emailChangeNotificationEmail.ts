import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName } from "../../config";

export async function sendEmailChangeNotificationEmail(
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  const appName = getAppName();

  const text = `Email Change Request

Someone has requested to change your ${appName} account email address to ${newEmail}.

If this was you, you can ignore this message. The change will only take effect after verification from the new email address.

If you did not request this change, please secure your account immediately by changing your password.`;

  const htmlText = `Email Change Request

Someone has requested to change your ${appName} account email address to ${newEmail}.

If this was you, you can ignore this message. The change will only take effect after verification from the new email address.

If you did not request this change, please secure your account immediately by changing your password.`;

  const html = textToHtml(htmlText);

  await sendEmail({
    to: oldEmail,
    subject: `Email change requested - ${appName}`,
    text,
    html,
  });
}
