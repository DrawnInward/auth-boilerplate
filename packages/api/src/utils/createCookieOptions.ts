import { CookieOptions } from "express";
import { TokenCookieOptions } from "../types";
import { extractCookieDomain } from "./extractCookieDomain";

export const createCookieOptions = (
  maxAge: number,
  options?: TokenCookieOptions
): CookieOptions => {
  const isSecure = options?.isSecure ?? process.env.NODE_ENV === "production";

  let domain: string | undefined;
  if (isSecure && options?.allowedOrigin) {
    domain = extractCookieDomain(options.allowedOrigin);
  }

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "strict" : "lax",
    maxAge,
    ...(domain && { domain }),
  };
};
