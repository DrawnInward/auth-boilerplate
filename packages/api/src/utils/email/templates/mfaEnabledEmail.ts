import { sendEmail } from "../sendEmail";
import { textToHtml } from "../textToHtml";
import { getAppName } from "../../config";

export async function sendMfaEnabledEmail(email: string): Promise<void> {
  const appName = getAppName();

  const text = `Two-factor authentication has been enabled on your ${appName} account.

Your account is now more secure. You will need to enter a code from your authenticator app each time you sign in.

If you did not enable two-factor authentication, please secure your account immediately by changing your password.`;

  const html = textToHtml(text);

  await sendEmail({
    to: email,
    subject: `Two-factor authentication enabled - ${appName}`,
    text,
    html,
  });
}
