export interface ClickableLink {
  url: string;
  text: string;
  style?: "button" | "link";
}

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<void>;
}
