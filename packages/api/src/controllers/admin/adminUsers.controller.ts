import { Request, Response, NextFunction } from "express";
import {
  getUsers,
  getUserById,
  getUser,
  getUserStats,
  modifyUser,
  deleteUser,
  updateUserOrgPermission,
} from "../../models/users.models";
import { disableMfa, deleteAllBackupCodes } from "../../models/mfa.models";
import { revokeUserTokens } from "../../models/refresh.models";
import db from "../../database/db";
import {
  createInvitation,
  invalidatePendingInvitations,
} from "../../models/invitations.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { getValidatedQuery } from "../../middleware/validate";
import type { UserParams, UsersQuery } from "@auth-boilerplate/shared";
import { services } from "../../services";
import { httpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

// POST /api/admin/users
export const createUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;

    const existingUser = await getUser(email);
    if (existingUser) {
      throw httpError(409, "Email already exists");
    }

    await invalidatePendingInvitations(email, "admin_invite");

    const { invitation, token } = await createInvitation({
      email,
      type: "admin_invite",
    });

    await services.email.sendAdminInvite(email, token);

    return sendCreated(
      res,
      { email: invitation.email, expires_at: invitation.expires_at },
      "Invitation sent successfully",
    );
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users
export const getAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { is_active, email_verified, limit, offset } =
      getValidatedQuery<UsersQuery>(res);
    const filters = { is_active, email_verified };
    const pagination = { limit, offset };

    const users = await getUsers(filters, pagination);

    return sendSuccess(res, users, "Users retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users/stats
export const getUserStatsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const stats = await getUserStats();

    return sendSuccess(res, stats, "User stats retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users/:userId
export const getUserByIdHandler = async (
  req: Request<UserParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;

    const user = await getUserById(userId);

    if (!user) {
      throw httpError(404, "User not found");
    }

    return sendSuccess(res, user, "User retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/users/:userId
export const updateUser = async (
  req: Request<UserParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    const updatedUser = await withTransaction(db, async (client) => {
      const updated = await modifyUser(userId, updates, client);
      // Deactivating an account must end its live sessions in the same
      // transaction, so a banned user can't keep working from an open tab.
      // The schema also lets deleted_at/deactivated_at through this endpoint —
      // any of the three means "this account stops working now". (S4)
      if (
        updates.is_active === false ||
        updates.deleted_at ||
        updates.deactivated_at
      ) {
        await revokeUserTokens(userId, "user", client);
      }
      return updated;
    });

    return sendSuccess(res, updatedUser, "User updated successfully");
  } catch (error) {
    next(error);
  }
};

export const sendPasswordReset = async (
  req: Request<UserParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;

    const user = await getUserById(userId);
    if (!user) {
      throw httpError(404, "User not found");
    }

    await invalidatePendingInvitations(user.email!, "password_reset");

    const { token } = await createInvitation({
      email: user.email!,
      type: "password_reset",
    });

    await services.email.sendPasswordReset(user.email!, token);

    return sendSuccess(res, { email: user.email }, "Password reset email sent");
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/users/:userId
export const deleteUserHandler = async (
  req: Request<UserParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;

    const deletedUser = await withTransaction(db, async (client) => {
      const deleted = await deleteUser(userId, client);
      // A deleted account keeps no working sessions. (S4)
      await revokeUserTokens(userId, "user", client);
      return deleted;
    });

    return sendSuccess(res, deletedUser, "User deleted successfully");
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/users/:userId/org-permission
export const updateOrgPermission = async (
  req: Request<UserParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;
    const { can_create_orgs } = req.body;

    if (
      can_create_orgs !== true &&
      can_create_orgs !== false &&
      can_create_orgs !== null
    ) {
      throw httpError(400, "can_create_orgs must be true, false, or null");
    }

    const updatedUser = await updateUserOrgPermission(userId, can_create_orgs);

    return sendSuccess(
      res,
      updatedUser,
      "User org permission updated successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const disableUserMfa = async (
  req: Request<UserParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;

    const user = await getUserById(userId);
    if (!user) {
      throw httpError(404, "User not found");
    }

    if (!user.mfa_enabled) {
      throw httpError(400, "MFA is not enabled for this user");
    }

    await withTransaction(db, async (client) => {
      await disableMfa(userId, "user", client);
      await deleteAllBackupCodes(userId, "user", client);
    });

    await services.email.sendMfaDisabled(user.email!);

    return sendSuccess(res, null, "MFA disabled for user");
  } catch (error) {
    next(error);
  }
};
