import { EmailOptions, EmailProvider } from "../../../interfaces/email";
import { childLogger } from "../../logger";

const log = childLogger("sendGridEmailProvider");

export class SendGridEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<void> {
    try {
      // @sendgrid/mail is deliberately not a declared dependency — only
      // deployments that select this provider need it installed. A static import
      // would break every other deployment at load time, so the require stays.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sgMail = require("@sendgrid/mail");
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

      await sgMail.send({
        to: options.to,
        from: {
          email: process.env.EMAIL_FROM!,
          name: process.env.EMAIL_FROM_NAME || "App",
        },
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
      });

      log.info("Email sent");
    } catch (error) {
      log.error({ err: error }, "Error sending email via SendGrid");
      throw error;
    }
  }
}
