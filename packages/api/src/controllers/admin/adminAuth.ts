import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../../database/db";
import { getAdminWithMfaStatus, getAdminById } from "../../models/admins.models";
import { addRefresh, revokeUserTokens } from "../../models/refresh.models";
import { sendSuccess } from "../../utils/responseUtils";
import { setAuthCookies, parseCookies } from "../../utils";
import { clearAuthCookies } from "../../utils/clearAuthCookies";
import {
  createMfaChallengeToken,
  setMfaChallengeCookie,
  verifyMfaChallengeToken,
  clearMfaChallengeCookie,
} from "../../utils/mfaChallenge";
import { getMfaSecret, getUnusedBackupCodes, markBackupCodeUsed } from "../../models/mfa.models";
import { verifyTotpCode } from "../../utils/totp";
import { RequestWithUser } from "../../types";

require("dotenv").config({ quiet: true });

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const admin = await getAdminWithMfaStatus(email);

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

    if (admin.mfa_enabled) {
      const challengeToken = createMfaChallengeToken(admin.admin_id!, "admin");
      setMfaChallengeCookie(res, challengeToken);

      return sendSuccess(
        res,
        { mfa_required: true },
        "MFA verification required"
      );
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

    const { token: refreshToken } = await addRefresh({
      role_id: admin.admin_id!,
      role_type: "admin",
    });

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

export const mfaLoginVerify = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code } = req.body;
    const cookies = parseCookies(req.headers.cookie);
    const challengeToken = cookies.mfa_challenge;

    if (!challengeToken) {
      throw { status: 401, msg: "MFA challenge not found" };
    }

    const payload = verifyMfaChallengeToken(challengeToken);
    if (payload.role_type !== "admin") {
      throw { status: 401, msg: "Invalid MFA challenge" };
    }

    const secret = await getMfaSecret(payload.role_id, "admin");
    if (!secret) {
      throw { status: 400, msg: "MFA not configured" };
    }

    if (!verifyTotpCode(secret, code)) {
      throw { status: 401, msg: "Invalid verification code" };
    }

    clearMfaChallengeCookie(res);

    const admin = await getAdminById(payload.role_id);
    const accessKey = process.env.ADMIN_ACCESS_KEY;

    if (!accessKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: payload.role_id,
        role_type: "admin",
        root: admin?.root || false,
      },
      accessKey,
      { expiresIn: "15m" }
    );

    const { token: refreshToken } = await addRefresh({
      role_id: payload.role_id,
      role_type: "admin",
    });

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, { admin_id: payload.role_id }, "Login successful");
  } catch (error) {
    next(error);
  }
};

export const mfaLoginBackupVerify = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { code } = req.body;
    const cookies = parseCookies(req.headers.cookie);
    const challengeToken = cookies.mfa_challenge;

    if (!challengeToken) {
      throw { status: 401, msg: "MFA challenge not found" };
    }

    const payload = verifyMfaChallengeToken(challengeToken);
    if (payload.role_type !== "admin") {
      throw { status: 401, msg: "Invalid MFA challenge" };
    }

    const unusedCodes = await getUnusedBackupCodes(payload.role_id, "admin", client);
    let matchedCode = null;

    for (const backupCode of unusedCodes) {
      if (await bcrypt.compare(code, backupCode.code_hash)) {
        matchedCode = backupCode;
        break;
      }
    }

    if (!matchedCode) {
      throw { status: 401, msg: "Invalid backup code" };
    }

    await markBackupCodeUsed(matchedCode.id, client);

    clearMfaChallengeCookie(res);

    const admin = await getAdminById(payload.role_id);
    const accessKey = process.env.ADMIN_ACCESS_KEY;

    if (!accessKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: payload.role_id,
        role_type: "admin",
        root: admin?.root || false,
      },
      accessKey,
      { expiresIn: "15m" }
    );

    const { token: refreshToken } = await addRefresh(
      {
        role_id: payload.role_id,
        role_type: "admin",
      },
      client
    );

    await client.query("COMMIT");

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, { admin_id: payload.role_id }, "Login successful");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

// GET /api/admin/auth/me
// Get current authenticated admin's profile
export const getMe = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const { role_id } = req.user!;

    const admin = await getAdminById(role_id);
    if (!admin) {
      throw { status: 404, msg: "Admin not found" };
    }

    return sendSuccess(
      res,
      {
        admin_id: admin.admin_id,
        email: admin.email,
        root: admin.root,
        email_verified: admin.email_verified,
        is_active: admin.is_active,
        mfa_enabled: admin.mfa_enabled,
        created_at: admin.created_at,
        updated_at: admin.updated_at,
      },
      "Admin profile retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/auth/logout
// Logout admin
export const logout = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user?.role_id) {
      await revokeUserTokens(req.user.role_id, "admin");
    }

    clearAuthCookies(res);

    return sendSuccess(res, null, "Admin logged out successfully");
  } catch (error) {
    next(error);
  }
};