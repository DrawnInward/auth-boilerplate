import { EmailOptions } from "../../../interfaces/email";
import { textToHtml } from "../textToHtml";

export interface AccountExistsEmailParams {
  to: string;
  appName: string;
  frontendUrl: string;
}

// Sent instead of a 409 when someone submits an address that already has an
// account (S5): the requester sees the same response either way, and only the
// address owner learns the account exists.
export function buildAccountExistsEmail({
  to,
  appName,
  frontendUrl,
}: AccountExistsEmailParams): EmailOptions {
  const loginUrl = `${frontendUrl}/login`;

  const text = `You already have an account

Someone tried to use this email address for ${appName}, but it already has an account.

If this was you, you can sign in here:

${loginUrl}

If you've forgotten your password, use "Forgot password" on the sign-in page.

If this wasn't you, you can safely ignore this email — no changes have been made to your account.`;

  const htmlText = `You already have an account

Someone tried to use this email address for ${appName}, but it already has an account.

If this was you, sign in with the button below. If you've forgotten your password, use "Forgot password" on the sign-in page.

If this wasn't you, you can safely ignore this email — no changes have been made to your account.`;

  return {
    to,
    subject: `You already have an account - ${appName}`,
    text,
    html: textToHtml(htmlText, {
      appName,
      links: [{ url: loginUrl, text: "Sign In" }],
    }),
  };
}
