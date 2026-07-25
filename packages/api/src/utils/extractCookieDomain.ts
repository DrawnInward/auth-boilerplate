import { childLogger } from "./logger";

const log = childLogger("extractCookieDomain");

export const extractCookieDomain = (origin: string): string | undefined => {
  try {
    const url = new URL(origin);
    const hostParts = url.hostname.split(".");

    // Handle .co.uk and other two-part TLDs
    if (hostParts.length >= 3 && hostParts.slice(-2).join(".") === "co.uk") {
      return "." + hostParts.slice(-3).join(".");
    } else if (hostParts.length >= 2) {
      return "." + hostParts.slice(-2).join(".");
    }
  } catch (e) {
    log.error({ err: e }, "Invalid origin format");
  }

  return undefined;
};
