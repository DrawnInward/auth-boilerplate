import { EmailProvider } from "../../../interfaces/email";
import { ConsoleEmailProvider } from "./ConsoleEmailProvider";
import { SendGridEmailProvider } from "./SendGridEmailProvider";
import { childLogger } from "../../logger";

const log = childLogger("emailProviders");

export { ConsoleEmailProvider } from "./ConsoleEmailProvider";
export { SendGridEmailProvider } from "./SendGridEmailProvider";
export { MemoryEmailProvider } from "./MemoryEmailProvider";

/**
 * Get the appropriate email provider based on environment.
 */
export function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER || "console";

  // In development, default to console unless explicitly set
  if (process.env.NODE_ENV !== "production" && provider === "console") {
    return new ConsoleEmailProvider();
  }

  switch (provider) {
    case "sendgrid":
      if (!process.env.SENDGRID_API_KEY) {
        log.warn("SENDGRID_API_KEY not set, falling back to console");
        return new ConsoleEmailProvider();
      }
      return new SendGridEmailProvider();
    case "console":
    default:
      return new ConsoleEmailProvider();
  }
}
