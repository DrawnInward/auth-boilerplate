import { Request, Response, NextFunction } from "express";
import { verifyPassword } from "../../utils/hashPassword";
import {
  getAdminWithMfaStatus,
  getAdminById,
} from "../../models/admins.models";
import { revokeUserTokens } from "../../models/refresh.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { setAuthCookies, parseCookies } from "../../utils";
import { clearAuthCookies } from "../../utils/clearAuthCookies";
import { services } from "../../services";
import {
  setMfaChallengeCookie,
  clearMfaChallengeCookie,
} from "../../utils/mfaChallenge";
import { RequestWithUser } from "../../types";
import { httpError } from "../../utils/httpError";

import "../../utils/loadEnv";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;

    const admin = await getAdminWithMfaStatus(email);

    if (!admin) {
      throw httpError(401, "Invalid credentials");
    }

    if (!admin.is_active) {
      throw httpError(403, "Account is deactivated");
    }

    const passwordMatch = await verifyPassword(password, admin.password_hash);

    if (!passwordMatch) {
      throw httpError(401, "Invalid credentials");
    }

    const start = await services.auth.startSession({
      role_type: "admin",
      role_id: admin.admin_id!,
      is_active: admin.is_active === true,
      mfa_enabled: admin.mfa_enabled === true,
      root: admin.root === true,
    });

    if (start.kind === "mfa_required") {
      setMfaChallengeCookie(res, start.challengeToken);

      return sendSuccess(
        res,
        { mfa_required: true },
        "MFA verification required",
      );
    }

    setAuthCookies(res, start.accessToken, start.refreshToken);

    return sendSuccess(
      res,
      {
        admin_id: admin.admin_id,
        email: admin.email,
        root: admin.root,
        email_verified: admin.email_verified,
        is_active: admin.is_active,
      },
      "Admin logged in successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const mfaLoginVerify = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { code } = req.body;
    const cookies = parseCookies(req.headers.cookie);

    const { principal: admin, tokens } =
      await services.adminMfa.completeLoginWithTotp(
        cookies.mfa_challenge,
        code,
        () => clearMfaChallengeCookie(res),
      );

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return sendSuccess(res, { admin_id: admin.admin_id }, "Login successful");
  } catch (error) {
    next(error);
  }
};

export const mfaLoginBackupVerify = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { code } = req.body;
    const cookies = parseCookies(req.headers.cookie);

    const { principal: admin, tokens } =
      await services.adminMfa.completeLoginWithBackupCode(
        cookies.mfa_challenge,
        code,
        () => clearMfaChallengeCookie(res),
      );

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return sendSuccess(res, { admin_id: admin.admin_id }, "Login successful");
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/auth/complete-registration
// Redeem an admin_registration invitation: create the admin account and log
// it in, mirroring the user complete-registration flow.
export const completeRegistration = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token, password } = req.body;
    const { accessToken, refreshToken, admin } =
      await services.credential.completeAdminRegistration({ token, password });

    setAuthCookies(res, accessToken, refreshToken);

    return sendCreated(
      res,
      {
        admin_id: admin.admin_id,
        email: admin.email,
        root: admin.root,
        email_verified: admin.email_verified,
        is_active: admin.is_active,
      },
      "Registration completed successfully",
    );
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/auth/me
// Get current authenticated admin's profile
export const getMe = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;

    const admin = await getAdminById(role_id);
    if (!admin) {
      throw httpError(404, "Admin not found");
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
      "Admin profile retrieved successfully",
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
  next: NextFunction,
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
