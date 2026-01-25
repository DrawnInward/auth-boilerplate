import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName } from "../../config";

export async function sendMfaDisabledEmail(email: string): Promise<void> {
  const appName = getAppName();

  const text = `Two-factor authentication has been disabled on your ${appName} account.

Your account is now less secure. We recommend enabling two-factor authentication to protect your account.

If you did not disable two-factor authentication, please secure your account immediately by changing your password and re-enabling two-factor authentication.`;

  const html = textToHtml(text);

  await sendEmail({
    to: email,
    subject: `Two-factor authentication disabled - ${appName}`,
    text,
    html,
  });
}
