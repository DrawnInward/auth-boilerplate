import jwt from "jsonwebtoken";
import { Response, NextFunction } from "express";
import { AccessJwtPayload, RefreshJwtPayload, RequestWithUser } from "../types";
import { parseCookies, setAuthCookies } from "../utils";
import { createAccessToken } from "../models/refresh.models";

require("dotenv").config({ quiet: true });

export const authoriseUser =
  (allowedRoles: string[]) =>
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    let token: null | string = null;
    let isRefresh = false;
    let isAdminToken = false;

    const parsedCookies = parseCookies(req.headers.cookie);

    if (parsedCookies.access_token) {
      const [, payload] = parsedCookies.access_token.split(".");
      const decodedPayload = Buffer.from(payload, "base64").toString("utf-8");
      const payloadObject = JSON.parse(decodedPayload);
      const expirationTime = payloadObject.exp;
      isAdminToken = payloadObject.role_type === "admin";

      if (Math.floor(Date.now() / 1000) < expirationTime) {
        token = parsedCookies.access_token;
      }
    }

    if (!token && parsedCookies.refresh_token) {
      token = parsedCookies.refresh_token;
      isRefresh = true;
    }

    if (!token) {
      return res.status(401).send({ msg: "Credentials missing" });
    }

    try {
      const secretKey = isRefresh
        ? process.env.REFRESH_KEY
        : isAdminToken
        ? process.env.ADMIN_ACCESS_KEY
        : process.env.USER_ACCESS_KEY;

      if (!secretKey) {
        throw {
          status: 500,
          msg: `Missing environment variable.`,
        };
      }

      const userDetails = jwt.verify(token, secretKey);

      if (isRefresh) {
        const refreshPayload = userDetails as RefreshJwtPayload;
        const { accessToken, newRefreshToken } = await createAccessToken(
          refreshPayload,
          token
        );

        setAuthCookies(res, accessToken, newRefreshToken);

        // Use the correct key based on role_type from the refresh token
        const accessKey =
          refreshPayload.role_type === "admin"
            ? process.env.ADMIN_ACCESS_KEY!
            : process.env.USER_ACCESS_KEY!;

        req.user = jwt.verify(accessToken, accessKey) as AccessJwtPayload;
      } else {
        req.user = userDetails as AccessJwtPayload;
      }

      if (!allowedRoles.includes(req.user.role_type)) {
        if (process.env.NODE_ENV === "production") {
          return res.status(403).json({
            msg: "Insufficient permissions",
          });
        } else {
          return res.status(403).json({
            msg: "Insufficient permissions",
          });
        }
      }

      next();
    } catch (error) {
      res.status(403).send({ msg: "Invalid Token" });
    }
  };
