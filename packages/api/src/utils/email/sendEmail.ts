import { EmailOptions } from "../../interfaces/email";
import { getEmailProvider } from "./providers";

export async function sendEmail(options: EmailOptions): Promise<void> {
  const provider = getEmailProvider();
  await provider.send(options);
}
