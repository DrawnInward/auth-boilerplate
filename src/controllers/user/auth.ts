import { Request, Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getUserWithPassword } from "../../models/users.models";
import { addRefresh, revokeUserTokens } from "../../models/refresh.models";
import { sendSuccess } from "../../utils/responseUtils";
import { setAuthCookies } from "../../utils";
import { clearAuthCookies } from "../../utils/clearAuthCookies";

require("dotenv").config({ quiet: true });

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    const user = await getUserWithPassword(email);

    if (!user) {
      throw { status: 401, msg: "Invalid credentials" };
    }

    if (!user.is_active) {
      throw { status: 403, msg: "Account is deactivated" };
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash!);

    if (!passwordMatch) {
      throw { status: 401, msg: "Invalid credentials" };
    }

    const accessKey = process.env.USER_ACCESS_KEY;
    const refreshKey = process.env.REFRESH_KEY;

    if (!accessKey || !refreshKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: user.user_id,
        role_type: "user",
        email_verified: user.email_verified,
      },
      accessKey,
      { expiresIn: "15m" }
    );

    const { token: refreshToken } = await addRefresh({
      role_id: user.user_id!,
      role_type: "user",
    });

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(
      res,
      {
        user_id: user.user_id,
        email: user.email,
        email_verified: user.email_verified,
        is_active: user.is_active,
      },
      "User logged in successfully"
    );
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user?.role_id) {
      await revokeUserTokens(req.user.role_id, "user");
    }

    clearAuthCookies(res);

    return sendSuccess(res, null, "User logged out successfully");
  } catch (error) {
    next(error);
  }
};
