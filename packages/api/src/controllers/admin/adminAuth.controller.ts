import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import db from "../../database/db";
import {
  getAdminWithMfaStatus,
  getAdminById,
} from "../../models/admins.models";
import { revokeUserTokens } from "../../models/refresh.models";
import { sendSuccess } from "../../utils/responseUtils";
import { setAuthCookies, parseCookies } from "../../utils";
import { clearAuthCookies } from "../../utils/clearAuthCookies";
import { services } from "../../services";
import {
  setMfaChallengeCookie,
  verifyMfaChallengeToken,
  clearMfaChallengeCookie,
  guardMfaChallenge,
  failMfaChallenge,
  consumeMfaChallengeOrThrow,
} from "../../utils/mfaChallenge";
import {
  getMfaSecret,
  getUnusedBackupCodes,
  markBackupCodeUsed,
} from "../../models/mfa.models";
import { verifyTotpCode } from "../../utils/totp";
import { RequestWithUser } from "../../types";
import { httpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

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

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);

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
    const challengeToken = cookies.mfa_challenge;

    if (!challengeToken) {
      throw httpError(401, "MFA challenge not found");
    }

    const payload = verifyMfaChallengeToken(challengeToken);
    if (payload.role_type !== "admin") {
      throw httpError(401, "Invalid MFA challenge");
    }

    await guardMfaChallenge(payload.jti);

    const secret = await getMfaSecret(payload.role_id, "admin");
    if (!secret) {
      throw httpError(400, "MFA not configured");
    }

    if (!verifyTotpCode(secret, code)) {
      await failMfaChallenge(payload.jti);
      throw httpError(401, "Invalid verification code");
    }

    await consumeMfaChallengeOrThrow(payload.jti);

    clearMfaChallengeCookie(res);

    const admin = await getAdminById(payload.role_id);
    if (!admin) {
      throw httpError(404, "Admin not found");
    }

    const { accessToken, refreshToken } = await services.auth.issueSession({
      role_type: "admin",
      role_id: payload.role_id,
      is_active: admin.is_active === true,
      root: admin.root === true,
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
  next: NextFunction,
) => {
  try {
    const { code } = req.body;
    const cookies = parseCookies(req.headers.cookie);
    const challengeToken = cookies.mfa_challenge;

    if (!challengeToken) {
      throw httpError(401, "MFA challenge not found");
    }

    const payload = verifyMfaChallengeToken(challengeToken);
    if (payload.role_type !== "admin") {
      throw httpError(401, "Invalid MFA challenge");
    }

    // On the pool, before the transaction opens (mirrored by the user
    // handler): the guard is a fail-fast pre-check, the CAS consume below is
    // the enforcement.
    await guardMfaChallenge(payload.jti);

    const { accessToken, refreshToken } = await withTransaction(
      db,
      async (client) => {
        const unusedCodes = await getUnusedBackupCodes(
          payload.role_id,
          "admin",
          client,
        );
        let matchedCode = null;

        for (const backupCode of unusedCodes) {
          if (await bcrypt.compare(code, backupCode.code_hash)) {
            matchedCode = backupCode;
            break;
          }
        }

        if (!matchedCode) {
          await failMfaChallenge(payload.jti);
          throw httpError(401, "Invalid backup code");
        }

        await markBackupCodeUsed(matchedCode.id, client);

        await consumeMfaChallengeOrThrow(payload.jti, client);

        clearMfaChallengeCookie(res);

        const admin = await getAdminById(payload.role_id);
        if (!admin) {
          throw httpError(404, "Admin not found");
        }

        return services.auth.issueSession(
          {
            role_type: "admin",
            role_id: payload.role_id,
            is_active: admin.is_active === true,
            root: admin.root === true,
          },
          client,
        );
      },
    );

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, { admin_id: payload.role_id }, "Login successful");
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
