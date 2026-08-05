import jwt from "jsonwebtoken";
import { Response, NextFunction } from "express";
import { AccessJwtPayload, RequestWithUser } from "../types";
import { parseCookies } from "../utils";
import { httpError, isHttpError } from "../utils/httpError";

import "../utils/loadEnv";

// Verification only — an expired access token is a clean 401, and the client
// exchanges its refresh cookie at POST /auth/refresh. Rotating here meant N
// parallel requests raced N rotations of one cookie (S1); the middleware no
// longer touches the refresh token at all.
export const authoriseUser =
  (allowedRoles: string[]) =>
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    let token: null | string = null;
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
        // treated as absent
      }
    }

    if (!token) {
      return next(httpError(401, "Credentials missing"));
    }

    try {
      const secretKey = isAdminToken
        ? process.env.ADMIN_ACCESS_KEY
        : process.env.USER_ACCESS_KEY;

      if (!secretKey) {
        throw httpError(500, `Missing environment variable.`);
      }

      req.user = jwt.verify(token, secretKey) as AccessJwtPayload;

      if (!allowedRoles.includes(req.user.role_type)) {
        return next(httpError(403, "Insufficient permissions"));
      }
      next();
    } catch (error) {
      // Config errors surface as the 500s they are. Every verify failure
      // flattens to one 403 so the response doesn't reveal which check failed.
      if (isHttpError(error) && error.status >= 500) {
        return next(error);
      }
      next(httpError(403, "Invalid Token"));
    }
  };
