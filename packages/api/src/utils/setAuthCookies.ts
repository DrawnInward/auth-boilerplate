import { createCookieOptions } from "./createCookieOptions";
import { getRefreshTokenDays } from "./config";
import { Response } from "express";

import "./loadEnv";

export const setAccessTokenCookie = (
  res: Response,
  token: string,
  maxAge: number = 15 * 60 * 1000, // 15 minutes default
): void => {
  const cookieOptions = createCookieOptions(maxAge, {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
  });

  res.cookie("access_token", token, cookieOptions);
};

export const setRefreshTokenCookie = (
  res: Response,
  token: string,
  maxAge: number = getRefreshTokenDays() * 24 * 60 * 60 * 1000,
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
  },
): void => {
  setAccessTokenCookie(res, accessToken, options?.accessTokenMaxAge);
  setRefreshTokenCookie(res, refreshToken, options?.refreshTokenMaxAge);
};
