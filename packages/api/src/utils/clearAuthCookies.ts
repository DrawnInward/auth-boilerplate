import { createCookieOptions } from "./createCookieOptions";
import { Response } from "express";

export const clearAuthCookies = (res: Response): void => {
  const cookieOptions = createCookieOptions(0, {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
  });

  // Set maxAge to 0 to clear cookies
  res.cookie("access_token", "", { ...cookieOptions, maxAge: 0 });
  res.cookie("refresh_token", "", { ...cookieOptions, maxAge: 0 });
  res.cookie("mfa_challenge", "", { ...cookieOptions, maxAge: 0 });
};
