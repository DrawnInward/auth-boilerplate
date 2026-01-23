import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getAdminWithPassword } from "../../models/admins.models";
import { sendSuccess } from "../../utils/responseUtils";
import { setAuthCookies } from "../../utils";

require("dotenv").config({ quiet: true });

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const admin = await getAdminWithPassword(email);

    if (!admin) {
      throw { status: 401, msg: "Invalid credentials" };
    }

    if (!admin.is_active) {
      throw { status: 403, msg: "Account is deactivated" };
    }

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatch) {
      throw { status: 401, msg: "Invalid credentials" };
    }

    const accessKey = process.env.ADMIN_ACCESS_KEY;
    const refreshKey = process.env.REFRESH_KEY;

    if (!accessKey || !refreshKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: admin.admin_id,
        role_type: "admin",
        root: admin.root,
      },
      accessKey,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      {
        role_id: admin.admin_id,
        role_type: "admin",
      },
      refreshKey,
      { expiresIn: "7d" }
    );

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(
      res,
      {
        admin_id: admin.admin_id,
        email: admin.email,
        root: admin.root,
        email_verified: admin.email_verified,
        is_active: admin.is_active,
      },
      "Admin logged in successfully"
    );
  } catch (error) {
    next(error);
  }
};