import { EmailOptions, EmailProvider } from "../../../interfaces/email";

// The email adapter's deterministic fake: it sends nowhere and records what it
// was given, so tests can assert on recipients, subjects and links without
// touching a network or reading logs.
export class MemoryEmailProvider implements EmailProvider {
  readonly sent: EmailOptions[] = [];

  async send(options: EmailOptions): Promise<void> {
    this.sent.push(options);
  }

  get last(): EmailOptions | undefined {
    return this.sent[this.sent.length - 1];
  }
}
