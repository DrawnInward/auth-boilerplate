import { EmailOptions, EmailProvider } from "../../../interfaces/email";

export class ConsoleEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    console.log("\n========== EMAIL ==========");
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Text:\n${options.text}`);
    if (options.html) {
      console.log(`HTML: [HTML content - ${options.html.length} chars]`);
    }
    console.log("============================\n");
  }
}
