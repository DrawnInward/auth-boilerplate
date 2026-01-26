import { EmailOptions, EmailProvider } from "../../../interfaces/email";

export class SendGridEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<void> {
    try {
      // Dynamic import to avoid requiring the package if not used
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

      console.log(`Email sent to ${options.to}`);
    } catch (error) {
      console.error("Error sending email via SendGrid:", error);
      throw error;
    }
  }
}
