import jwt from "jsonwebtoken";
import { Response, NextFunction } from "express";
import { AccessJwtPayload, RefreshJwtPayload, RequestWithUser } from "../types";
import { parseCookies, setAuthCookies } from "../utils";
import { createAccessToken } from "../models/refresh.models";
import { httpError, isHttpError } from "../utils/httpError";

import "../utils/loadEnv";

export const authoriseUser =
  (allowedRoles: string[]) =>
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    let token: null | string = null;
    let isRefresh = false;
    let isAdminToken = false;

    const parsedCookies = parseCookies(req.headers.cookie);

    if (parsedCookies.access_token) {
      // A cookie that doesn't parse is treated as no cookie at all — parsing
      // outside a try meant one malformed cookie 500'd every request from
      // that browser until it was manually cleared.
      try {
        const [, payload] = parsedCookies.access_token.split(".");
        const decodedPayload = Buffer.from(payload, "base64").toString("utf-8");
        const payloadObject = JSON.parse(decodedPayload);
        const expirationTime = payloadObject.exp;
        isAdminToken = payloadObject.role_type === "admin";

        if (Math.floor(Date.now() / 1000) < expirationTime) {
          token = parsedCookies.access_token;
        }
      } catch {
        // fall through to the refresh token, if present
      }
    }

    if (!token && parsedCookies.refresh_token) {
      token = parsedCookies.refresh_token;
      isRefresh = true;
    }

    if (!token) {
      return next(httpError(401, "Credentials missing"));
    }

    try {
      const secretKey = isRefresh
        ? process.env.REFRESH_KEY
        : isAdminToken
          ? process.env.ADMIN_ACCESS_KEY
          : process.env.USER_ACCESS_KEY;

      if (!secretKey) {
        throw httpError(500, `Missing environment variable.`);
      }

      const userDetails = jwt.verify(token, secretKey);

      if (isRefresh) {
        const refreshPayload = userDetails as RefreshJwtPayload;
        const { accessToken, newRefreshToken } = await createAccessToken(
          refreshPayload,
          token,
        );

        setAuthCookies(res, accessToken, newRefreshToken);

        const accessKey =
          refreshPayload.role_type === "admin"
            ? process.env.ADMIN_ACCESS_KEY!
            : process.env.USER_ACCESS_KEY!;

        req.user = jwt.verify(accessToken, accessKey) as AccessJwtPayload;
      } else {
        req.user = userDetails as AccessJwtPayload;
      }

      if (!allowedRoles.includes(req.user.role_type)) {
        return next(httpError(403, "Insufficient permissions"));
      }
      next();
    } catch (error) {
      // Config errors surface as the 500s they are. Every auth failure —
      // bad signature, expired/revoked/replayed refresh lineage — flattens
      // to one 403 so the response doesn't reveal which check failed;
      // per-cause refresh statuses are a Phase C (dedicated endpoint) concern.
      if (isHttpError(error) && error.status >= 500) {
        return next(error);
      }
      next(httpError(403, "Invalid Token"));
    }
  };
