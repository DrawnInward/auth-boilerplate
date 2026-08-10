import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { RefreshJwtPayload, RequestWithUser } from "../../types";
import bcrypt from "bcrypt";
import db from "../../database/db";
import {
  createUser,
  getUser,
  getUserWithPasswordById,
  updatePassword,
  getUserWithMfaStatus,
  getUserById,
  modifyUser,
  setAuthProvider,
} from "../../models/users.models";
import {
  createAccessToken,
  revokeUserTokens,
} from "../../models/refresh.models";
import {
  createInvitation,
  validateInvitationToken,
  markInvitationUsed,
  invalidatePendingInvitations,
} from "../../models/invitations.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import type { TokenParams } from "@auth-boilerplate/shared";
import { setAuthCookies, hashPassword } from "../../utils";
import { clearAuthCookies } from "../../utils/clearAuthCookies";
import { services } from "../../services";
import {
  setMfaChallengeCookie,
  clearMfaChallengeCookie,
} from "../../utils/mfaChallenge";
import { parseCookies } from "../../utils";
import { getAccountCreationMode, getOrgCreationMode } from "../../utils/config";
import { httpError, isHttpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

import "../../utils/loadEnv";

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
      throw httpError(401, "Invalid credentials");
    }

    if (!user.is_active) {
      throw httpError(403, "Account is deactivated");
    }

    if (!user.password_hash) {
      throw httpError(401, "Invalid credentials");
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      throw httpError(401, "Invalid credentials");
    }

    const start = await services.auth.startSession({
      role_type: "user",
      role_id: user.user_id!,
      is_active: user.is_active === true,
      mfa_enabled: user.mfa_enabled === true,
      email_verified: user.email_verified === true,
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

// The one place a refresh token is exchanged (S1/A1): the middleware only
// verifies access tokens, and clients call this on a 401. The refresh cookie
// itself is the credential and names its principal, so one endpoint serves
// both roles.
export const refreshSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies.refresh_token;

    if (!refreshToken) {
      throw httpError(401, "Credentials missing");
    }

    const refreshKey = process.env.REFRESH_KEY;
    if (!refreshKey) {
      throw httpError(500, "Missing environment variable.");
    }

    let payload: RefreshJwtPayload;
    try {
      payload = jwt.verify(refreshToken, refreshKey) as RefreshJwtPayload;
    } catch {
      throw httpError(401, "Invalid refresh token");
    }

    let accessToken: string;
    let newRefreshToken: string;
    try {
      ({ accessToken, newRefreshToken } = await createAccessToken(
        payload,
        refreshToken,
      ));
    } catch (error) {
      // A validly-signed token whose row is gone must read exactly like a
      // forged one — one 401, not a 404 oracle.
      if (isHttpError(error) && error.status === 404) {
        throw httpError(401, "Invalid refresh token");
      }
      throw error;
    }

    setAuthCookies(res, accessToken, newRefreshToken);

    return sendSuccess(res, null, "Token refreshed");
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

    const { principal: user, tokens } =
      await services.userMfa.completeLoginWithTotp(
        cookies.mfa_challenge,
        code,
        () => clearMfaChallengeCookie(res),
      );

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

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
  try {
    const { code } = req.body;
    const cookies = parseCookies(req.headers.cookie);

    const { principal: user, tokens } =
      await services.userMfa.completeLoginWithBackupCode(
        cookies.mfa_challenge,
        code,
        () => clearMfaChallengeCookie(res),
      );

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return sendSuccess(res, buildUserResponse(user), "Login successful");
  } catch (error) {
    next(error);
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
      throw httpError(403, "Self-registration is not allowed");
    }

    const { email } = req.body;

    // The models canonicalise to lowercase (stored users, invitation rows),
    // so the response echoes the canonical form on both branches.
    const canonicalEmail = email.toLowerCase();

    const existingUser = await getUser(email);
    if (existingUser) {
      // S5: the shared exit below keeps the response identical to the
      // new-account path, so the body never reveals whether the address has
      // an account — the owner is told by email instead. (Residual: this
      // branch skips the invitation writes, so timing is not fully
      // equalised.)
      await services.email.sendAccountExists(canonicalEmail);
    } else {
      await invalidatePendingInvitations(email, "registration");

      const { token } = await createInvitation({
        email,
        type: "registration",
      });

      await services.email.sendVerification(email, token);
    }

    return sendCreated(
      res,
      { email: canonicalEmail },
      "Registration email sent. Please check your inbox.",
    );
  } catch (error) {
    next(error);
  }
};

export const verifyToken = async (
  req: Request<TokenParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.params.token;

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
  try {
    const { accessToken, refreshToken, user } = await withTransaction(
      db,
      async (client) => {
        const { token, password } = req.body;

        const invitation = await validateInvitationToken(
          token,
          undefined,
          client,
        );

        if (
          invitation.type !== "registration" &&
          invitation.type !== "admin_invite"
        ) {
          throw httpError(400, "Invalid invitation type for registration");
        }

        const createdThrough =
          invitation.type === "admin_invite"
            ? "admin_created"
            : "self_registered";

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

        const tokens = await services.auth.issueSession(
          {
            role_type: "user",
            role_id: user.user_id!,
            is_active: user.is_active === true,
            email_verified: user.email_verified === true,
          },
          client,
        );

        return { ...tokens, user };
      },
    );

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
    next(error);
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
      await services.email.sendPasswordReset(email, token);
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
  try {
    await withTransaction(db, async (client) => {
      const { token, password } = req.body;

      const invitation = await validateInvitationToken(
        token,
        "password_reset",
        client,
      );
      const user = await getUser(invitation.email);
      if (!user) {
        throw httpError(404, "User not found");
      }

      const passwordHash = await hashPassword(password);
      await updatePassword(user.user_id!, passwordHash, client);

      await markInvitationUsed(invitation.id!, client);

      await revokeUserTokens(user.user_id!, "user", client);
    });

    return sendSuccess(res, null, "Password reset successfully");
  } catch (error) {
    next(error);
  }
};

export const setPassword = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    await withTransaction(db, async (client) => {
      const { role_id } = req.user!;
      const { password } = req.body;

      const user = await getUserWithPasswordById(role_id);
      if (!user) {
        throw httpError(404, "User not found");
      }

      if (user.password_hash) {
        throw httpError(
          400,
          "Password already set. Use password reset instead.",
        );
      }

      const passwordHash = await hashPassword(password);
      await updatePassword(role_id, passwordHash, client);
      await setAuthProvider(role_id, "both", client);
    });

    return sendSuccess(res, null, "Password set successfully");
  } catch (error) {
    next(error);
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
      throw httpError(404, "User not found");
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
  try {
    await withTransaction(db, async (client) => {
      const { role_id } = req.user!;
      const { current_password, new_password } = req.body;

      const user = await getUserWithPasswordById(role_id);
      if (!user) {
        throw httpError(404, "User not found");
      }

      if (!user.password_hash) {
        throw httpError(
          400,
          "No password set. Use set-password endpoint instead.",
        );
      }

      const passwordMatch = await bcrypt.compare(
        current_password,
        user.password_hash,
      );
      if (!passwordMatch) {
        throw httpError(401, "Current password is incorrect");
      }

      const passwordHash = await hashPassword(new_password);
      await updatePassword(role_id, passwordHash, client);

      await revokeUserTokens(role_id, "user", client);
    });

    return sendSuccess(res, null, "Password changed successfully");
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
      throw httpError(404, "User not found");
    }

    if (!user.password_hash) {
      throw httpError(400, "Password not set. Please set a password first.");
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw httpError(401, "Incorrect password");
    }

    if (user.email?.toLowerCase() === newEmail.toLowerCase()) {
      throw httpError(400, "New email is the same as current email");
    }

    const existingUser = await getUser(newEmail);
    if (existingUser) {
      // S5: the shared exit below keeps the response identical to the
      // success path — same emails to the same inboxes, so neither the body
      // nor the requester's own inbox reveals whether the target address has
      // an account. No invitation exists, so the change can never complete;
      // this log line is support's only way to tell that apart from a
      // delivered-but-unclicked verification email.
      req.log?.info(
        { event: "email_change_refused_target_exists", userId: role_id },
        "email change target already has an account; account-exists notice sent",
      );
      await services.email.sendAccountExists(newEmail);
    } else {
      const { token } = await createInvitation({
        email: user.email!,
        type: "email_change",
        new_email: newEmail,
        user_id: role_id,
      });

      await services.email.sendEmailChangeVerification(newEmail, token);
    }

    await services.email.sendEmailChangeNotification(user.email!, newEmail);

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
  req: Request<TokenParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { invitation } = await withTransaction(db, async (client) => {
      const token = req.params.token;

      const invitation = await validateInvitationToken(
        token,
        "email_change",
        client,
      );

      if (!invitation.new_email || !invitation.user_id) {
        throw httpError(400, "Invalid email change invitation");
      }

      const existingUser = await getUser(invitation.new_email);
      if (existingUser) {
        throw httpError(409, "Email is no longer available");
      }

      await modifyUser(
        invitation.user_id,
        { email: invitation.new_email.toLowerCase() },
        client,
      );
      await markInvitationUsed(invitation.id!, client);

      return { invitation };
    });

    return sendSuccess(
      res,
      { email: invitation.new_email },
      "Email changed successfully",
    );
  } catch (error) {
    next(error);
  }
};
