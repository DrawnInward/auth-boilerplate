import { Request, Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../../database/db";
import {
  createUser,
  getUser,
  getUserWithPassword,
  getUserWithPasswordById,
  updatePassword,
  getUserWithMfaStatus,
  getUserById,
  setAuthProvider,
} from "../../models/users.models";
import { addRefresh, revokeUserTokens } from "../../models/refresh.models";
import {
  createInvitation,
  validateInvitationToken,
  markInvitationUsed,
  invalidatePendingInvitations,
} from "../../models/invitations.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { setAuthCookies, hashPassword } from "../../utils";
import { clearAuthCookies } from "../../utils/clearAuthCookies";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../../utils/email";
import {
  createMfaChallengeToken,
  setMfaChallengeCookie,
  verifyMfaChallengeToken,
  clearMfaChallengeCookie,
} from "../../utils/mfaChallenge";
import { getMfaSecret, getUnusedBackupCodes, markBackupCodeUsed } from "../../models/mfa.models";
import { verifyTotpCode } from "../../utils/totp";
import { parseCookies } from "../../utils";

require("dotenv").config({ quiet: true });

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    const user = await getUserWithMfaStatus(email);

    if (!user) {
      throw { status: 401, msg: "Invalid credentials" };
    }

    if (!user.is_active) {
      throw { status: 403, msg: "Account is deactivated" };
    }

    if (!user.password_hash) {
      throw { status: 401, msg: "Invalid credentials" };
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      throw { status: 401, msg: "Invalid credentials" };
    }

    if (user.mfa_enabled) {
      const challengeToken = createMfaChallengeToken(user.user_id!, "user");
      setMfaChallengeCookie(res, challengeToken);

      return sendSuccess(
        res,
        { mfa_required: true },
        "MFA verification required"
      );
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
    if (payload.role_type !== "user") {
      throw { status: 401, msg: "Invalid MFA challenge" };
    }

    const secret = await getMfaSecret(payload.role_id, "user");
    if (!secret) {
      throw { status: 400, msg: "MFA not configured" };
    }

    if (!verifyTotpCode(secret, code)) {
      throw { status: 401, msg: "Invalid verification code" };
    }

    clearMfaChallengeCookie(res);

    const accessKey = process.env.USER_ACCESS_KEY;

    if (!accessKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: payload.role_id,
        role_type: "user",
        email_verified: true,
      },
      accessKey,
      { expiresIn: "15m" }
    );

    const { token: refreshToken } = await addRefresh({
      role_id: payload.role_id,
      role_type: "user",
    });

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, { user_id: payload.role_id }, "Login successful");
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
    if (payload.role_type !== "user") {
      throw { status: 401, msg: "Invalid MFA challenge" };
    }

    const unusedCodes = await getUnusedBackupCodes(payload.role_id, "user", client);
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

    const accessKey = process.env.USER_ACCESS_KEY;

    if (!accessKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: payload.role_id,
        role_type: "user",
        email_verified: true,
      },
      accessKey,
      { expiresIn: "15m" }
    );

    const { token: refreshToken } = await addRefresh(
      {
        role_id: payload.role_id,
        role_type: "user",
      },
      client
    );

    await client.query("COMMIT");

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(res, { user_id: payload.role_id }, "Login successful");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

// POST /api/auth/register
// Submit email to start registration process
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if self-registration is allowed
    if (process.env.ALLOW_SELF_REGISTRATION === "false") {
      throw { status: 403, msg: "Self-registration is not allowed" };
    }

    const { email } = req.body;

    // Check if user already exists
    const existingUser = await getUser(email);
    if (existingUser) {
      throw { status: 409, msg: "Email already registered" };
    }

    // Invalidate any existing registration invitations for this email
    await invalidatePendingInvitations(email, "registration");

    // Create new registration invitation
    const { invitation, token } = await createInvitation({
      email,
      type: "registration",
    });

    // Send verification email
    await sendVerificationEmail(email, token);

    return sendCreated(
      res,
      { email: invitation.email },
      "Registration email sent. Please check your inbox."
    );
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/verify/:token
// Validate a token and return invitation details
export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.params.token as string;

    const invitation = await validateInvitationToken(token);

    return sendSuccess(
      res,
      {
        email: invitation.email,
        type: invitation.type,
        is_existing_user: invitation.is_existing_user,
        organization_id: invitation.organization_id,
        role: invitation.role,
      },
      "Token is valid"
    );
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/complete-registration
// Complete registration with token and password
export const completeRegistration = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { token, password } = req.body;

    // Validate token
    const invitation = await validateInvitationToken(token, "registration", client);

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await createUser(
      {
        email: invitation.email,
        password_hash: passwordHash,
        email_verified: true, // Email is verified through the token
        is_active: true,
      },
      client
    );

    // Mark invitation as used
    await markInvitationUsed(invitation.id!, client);

    // Create tokens
    const accessKey = process.env.USER_ACCESS_KEY;
    if (!accessKey) {
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

    const { token: refreshToken } = await addRefresh(
      {
        role_id: user.user_id!,
        role_type: "user",
      },
      client
    );

    await client.query("COMMIT");

    setAuthCookies(res, accessToken, refreshToken);

    return sendCreated(
      res,
      {
        user_id: user.user_id,
        email: user.email,
        email_verified: user.email_verified,
        is_active: user.is_active,
      },
      "Registration completed successfully"
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

// POST /api/auth/forgot-password
// Request a password reset email
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    // Always return success to prevent email enumeration
    // But only actually send email if user exists
    const user = await getUser(email);

    if (user) {
      // Invalidate any existing password reset invitations
      await invalidatePendingInvitations(email, "password_reset");

      // Create password reset invitation
      const { token } = await createInvitation({
        email,
        type: "password_reset",
      });

      // Send password reset email
      await sendPasswordResetEmail(email, token);
    }

    // Always return success (don't leak whether email exists)
    return sendSuccess(
      res,
      null,
      "If an account exists with this email, a password reset link has been sent."
    );
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/reset-password
// Reset password with token and new password
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { token, password } = req.body;

    // Validate token
    const invitation = await validateInvitationToken(
      token,
      "password_reset",
      client
    );

    // Find the user
    const user = await getUser(invitation.email);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    // Update password
    const passwordHash = await hashPassword(password);
    await updatePassword(user.user_id!, passwordHash, client);

    // Mark invitation as used
    await markInvitationUsed(invitation.id!, client);

    // Revoke all existing refresh tokens for security
    await revokeUserTokens(user.user_id!, "user", client);

    await client.query("COMMIT");

    return sendSuccess(res, null, "Password reset successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const setPassword = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { role_id } = req.user!;
    const { password } = req.body;

    const user = await getUserWithPasswordById(role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    if (user.password_hash) {
      throw { status: 400, msg: "Password already set. Use password reset instead." };
    }

    const passwordHash = await hashPassword(password);
    await updatePassword(role_id, passwordHash, client);
    await setAuthProvider(role_id, "both", client);

    await client.query("COMMIT");

    return sendSuccess(res, null, "Password set successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
