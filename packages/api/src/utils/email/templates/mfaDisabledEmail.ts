import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface MfaDisabledEmailParams {
  to: string;
  appName: string;
}

export function buildMfaDisabledEmail({
  to,
  appName,
}: MfaDisabledEmailParams): EmailOptions {
  const text = `Two-factor authentication has been disabled on your ${appName} account.

Your account is now less secure. We recommend enabling two-factor authentication to protect your account.

If you did not disable two-factor authentication, please secure your account immediately by changing your password and re-enabling two-factor authentication.`;

  return {
    to,
    subject: `Two-factor authentication disabled - ${appName}`,
    text,
    html: textToHtml(text, { appName }),
  };
}
