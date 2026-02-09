import { Request, Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../../database/db";
import {
  createUser,
  getUser,
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
  sendEmailChangeVerificationEmail,
  sendEmailChangeNotificationEmail,
} from "../../utils/email";
import {
  createMfaChallengeToken,
  setMfaChallengeCookie,
  verifyMfaChallengeToken,
  clearMfaChallengeCookie,
} from "../../utils/mfaChallenge";
import {
  getMfaSecret,
  getUnusedBackupCodes,
  markBackupCodeUsed,
} from "../../models/mfa.models";
import { verifyTotpCode } from "../../utils/totp";
import { parseCookies } from "../../utils";
import { getAccountCreationMode, getOrgCreationMode } from "../../utils/config";

require("dotenv").config({ quiet: true });

interface UserRecord {
  user_id?: string;
  email?: string;
  email_verified?: boolean;
  is_active?: boolean;
  mfa_enabled?: boolean;
  auth_provider?: string;
  google_id?: string | null;
  created_through?: string;
  can_create_orgs?: boolean | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

function buildUserResponse(user: UserRecord) {
  let canCreateOrgs = false;
  if (user.can_create_orgs === true) {
    canCreateOrgs = true;
  } else if (user.can_create_orgs === false) {
    canCreateOrgs = false;
  } else {
    const mode = getOrgCreationMode();
    if (mode === "open") {
      canCreateOrgs = true;
    } else if (mode === "self_registered_only") {
      canCreateOrgs = user.created_through === "self_registered";
    }
  }

  return {
    user_id: user.user_id,
    email: user.email,
    email_verified: user.email_verified,
    is_active: user.is_active,
    mfa_enabled: user.mfa_enabled,
    auth_provider: user.auth_provider,
    google_id: user.google_id ? true : false,
    created_through: user.created_through,
    can_create_orgs: canCreateOrgs,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
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
        "MFA verification required",
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
      { expiresIn: "15m" },
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
      "User logged in successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
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
  next: NextFunction,
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
      { expiresIn: "15m" },
    );

    const { token: refreshToken } = await addRefresh({
      role_id: payload.role_id,
      role_type: "user",
    });

    setAuthCookies(res, accessToken, refreshToken);

    const user = await getUserById(payload.role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    return sendSuccess(res, buildUserResponse(user), "Login successful");
  } catch (error) {
    next(error);
  }
};

export const mfaLoginBackupVerify = async (
  req: Request,
  res: Response,
  next: NextFunction,
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

    const unusedCodes = await getUnusedBackupCodes(
      payload.role_id,
      "user",
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
      { expiresIn: "15m" },
    );

    const { token: refreshToken } = await addRefresh(
      {
        role_id: payload.role_id,
        role_type: "user",
      },
      client,
    );

    await client.query("COMMIT");

    setAuthCookies(res, accessToken, refreshToken);

    const user = await getUserById(payload.role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    return sendSuccess(res, buildUserResponse(user), "Login successful");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const accountMode = getAccountCreationMode();
    if (accountMode !== "open") {
      throw { status: 403, msg: "Self-registration is not allowed" };
    }

    const { email } = req.body;

    const existingUser = await getUser(email);
    if (existingUser) {
      throw { status: 409, msg: "Email already registered" };
    }

    await invalidatePendingInvitations(email, "registration");

    const { invitation, token } = await createInvitation({
      email,
      type: "registration",
    });

    await sendVerificationEmail(email, token);

    return sendCreated(
      res,
      { email: invitation.email },
      "Registration email sent. Please check your inbox.",
    );
  } catch (error) {
    next(error);
  }
};

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
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
      "Token is valid",
    );
  } catch (error) {
    next(error);
  }
};

export const completeRegistration = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { token, password } = req.body;

    const invitation = await validateInvitationToken(token, undefined, client);

    if (invitation.type !== "registration" && invitation.type !== "admin_invite") {
      throw { status: 400, msg: "Invalid invitation type for registration" };
    }

    const createdThrough = invitation.type === "admin_invite" ? "admin_created" : "self_registered";

    const passwordHash = await hashPassword(password);
    const user = await createUser(
      {
        email: invitation.email,
        password_hash: passwordHash,
        email_verified: true,
        is_active: true,
        created_through: createdThrough,
      },
      client,
    );

    await markInvitationUsed(invitation.id!, client);

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
      { expiresIn: "15m" },
    );

    const { token: refreshToken } = await addRefresh(
      {
        role_id: user.user_id!,
        role_type: "user",
      },
      client,
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
      "Registration completed successfully",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;
    const user = await getUser(email);

    if (user) {
      await invalidatePendingInvitations(email, "password_reset");

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
      "If an account exists with this email, a password reset link has been sent.",
    );
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { token, password } = req.body;

    const invitation = await validateInvitationToken(
      token,
      "password_reset",
      client,
    );
    const user = await getUser(invitation.email);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    const passwordHash = await hashPassword(password);
    await updatePassword(user.user_id!, passwordHash, client);

    await markInvitationUsed(invitation.id!, client);

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
  next: NextFunction,
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
      throw {
        status: 400,
        msg: "Password already set. Use password reset instead.",
      };
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

export const getMe = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;

    const user = await getUserById(role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    return sendSuccess(
      res,
      buildUserResponse(user),
      "User profile retrieved successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { role_id } = req.user!;
    const { current_password, new_password } = req.body;

    const user = await getUserWithPasswordById(role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    if (!user.password_hash) {
      throw {
        status: 400,
        msg: "No password set. Use set-password endpoint instead.",
      };
    }

    const passwordMatch = await bcrypt.compare(
      current_password,
      user.password_hash,
    );
    if (!passwordMatch) {
      throw { status: 401, msg: "Current password is incorrect" };
    }

    const passwordHash = await hashPassword(new_password);
    await updatePassword(role_id, passwordHash, client);

    await revokeUserTokens(role_id, "user", client);

    await client.query("COMMIT");

    return sendSuccess(res, null, "Password changed successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const updateProfile = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;

    const user = await getUserById(role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    return sendSuccess(
      res,
      {
        user_id: user.user_id,
        email: user.email,
        email_verified: user.email_verified,
        is_active: user.is_active,
        mfa_enabled: user.mfa_enabled,
        auth_provider: user.auth_provider,
      },
      "Profile retrieved successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const requestEmailChange = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;
    const { newEmail, password } = req.body;

    const user = await getUserWithPasswordById(role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    if (!user.password_hash) {
      throw {
        status: 400,
        msg: "Password not set. Please set a password first.",
      };
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw { status: 401, msg: "Incorrect password" };
    }

    if (user.email?.toLowerCase() === newEmail.toLowerCase()) {
      throw { status: 400, msg: "New email is the same as current email" };
    }

    const existingUser = await getUser(newEmail);
    if (existingUser) {
      throw { status: 409, msg: "Email already in use" };
    }

    const { token } = await createInvitation({
      email: user.email!,
      type: "email_change",
      new_email: newEmail,
      user_id: role_id,
    });

    await sendEmailChangeVerificationEmail(newEmail, token);

    await sendEmailChangeNotificationEmail(user.email!, newEmail);

    return sendSuccess(
      res,
      { newEmail },
      "Verification email sent to your new email address",
    );
  } catch (error) {
    next(error);
  }
};

export const confirmEmailChange = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const token = req.params.token as string;

    const invitation = await validateInvitationToken(
      token,
      "email_change",
      client,
    );

    if (!invitation.new_email || !invitation.user_id) {
      throw { status: 400, msg: "Invalid email change invitation" };
    }

    const existingUser = await getUser(invitation.new_email);
    if (existingUser) {
      throw { status: 409, msg: "Email is no longer available" };
    }

    await client.query(
      "UPDATE users SET email = $1, updated_at = NOW() WHERE user_id = $2",
      [invitation.new_email.toLowerCase(), invitation.user_id],
    );
    await markInvitationUsed(invitation.id!, client);

    await client.query("COMMIT");

    return sendSuccess(
      res,
      { email: invitation.new_email },
      "Email changed successfully",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
