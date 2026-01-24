import { ClickableLink } from "../interfaces/email";
import { escapeHtml } from "./escapeHtml";
import { sanitizeUrl } from "./sanitizeUrl";

export const buildClickableLinks = (clickableLinks: ClickableLink[]): string => {
  if (!clickableLinks || clickableLinks.length === 0) {
    return "";
  }

  const linkButtons = clickableLinks
    .map((link) => {
      const safeUrl = sanitizeUrl(link.url);
      const safeText = escapeHtml(link.text);
      return `
          <a href="${safeUrl}"
             style="display: inline-block;
                    background-color: #4A90E2;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 5px;
                    font-weight: bold;
                    text-align: center;">
            ${safeText}
          </a>`;
    })
    .join("");

  return `
      <div style="text-align: center; margin: 20px 0;">
        ${linkButtons}
      </div>`;
};
