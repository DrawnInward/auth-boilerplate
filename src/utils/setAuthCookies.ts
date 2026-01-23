import { createCookieOptions } from "./createCookieOptions";
import { Response } from "express";

require("dotenv").config({ quiet: true });

export const setAccessTokenCookie = (
  res: Response,
  token: string,
  maxAge: number = 15 * 60 * 1000 // 15 minutes default
): void => {
  const cookieOptions = createCookieOptions(maxAge, {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
  });

  res.cookie("access_token", token, cookieOptions);
};

export const setRefreshTokenCookie = (
  res: Response,
  token: string,
  maxAge: number = 90 * 24 * 60 * 60 * 1000 // 90 days default
): void => {
  const cookieOptions = createCookieOptions(maxAge, {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
  });

  res.cookie("refresh_token", token, cookieOptions);
};

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
  options?: {
    accessTokenMaxAge?: number;
    refreshTokenMaxAge?: number;
  }
): void => {
  setAccessTokenCookie(res, accessToken, options?.accessTokenMaxAge);
  setRefreshTokenCookie(res, refreshToken, options?.refreshTokenMaxAge);
};
