import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface MfaEnabledEmailParams {
  to: string;
  appName: string;
}

export function buildMfaEnabledEmail({
  to,
  appName,
}: MfaEnabledEmailParams): EmailOptions {
  const text = `Two-factor authentication has been enabled on your ${appName} account.

Your account is now more secure. You will need to enter a code from your authenticator app each time you sign in.

If you did not enable two-factor authentication, please secure your account immediately by changing your password.`;

  return {
    to,
    subject: `Two-factor authentication enabled - ${appName}`,
    text,
    html: textToHtml(text, { appName }),
  };
}
