import { ClickableLink } from "../../interfaces/email";
import { escapeHtml } from "../escapeHtml";
import { sanitizeUrl } from "../sanitizeUrl";
import { buildClickableLinks } from "../buildClickableLinks";

export interface TextToHtmlOptions {
  /** Branding for the header and footer. Passed in so this stays pure. */
  appName: string;
  links?: ClickableLink[];
  unsubscribeUrl?: string;
}

export function textToHtml(text: string, options: TextToHtmlOptions): string {
  const { links, unsubscribeUrl } = options;
  const appName = escapeHtml(options.appName);
  const escapedText = escapeHtml(text);

  const paragraphs = escapedText
    .split("\n\n")
    .map(
      (p) =>
        `<p style="margin: 0 0 16px 0; line-height: 1.6;">${p.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const linksHtml = links ? buildClickableLinks(links) : "";

  const unsubscribeHtml = unsubscribeUrl
    ? `<div style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 16px;">
        If you no longer wish to receive these emails, <a href="${sanitizeUrl(unsubscribeUrl)}" style="color: #2563eb; text-decoration: underline;">click here to unsubscribe</a>.
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <style>
    body { margin: 0; padding: 0; }
    table { border-collapse: collapse; }
    img { border: 0; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); padding: 30px 25px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${appName}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 30px 25px; color: #1f2937;">
              ${paragraphs}
              ${linksHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 25px 25px 25px;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                This email was sent by ${appName}. If you didn't request this, you can safely ignore it.
              </p>
              ${unsubscribeHtml}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
