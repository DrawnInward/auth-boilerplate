import { Request, Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import {
  getUsers,
  getUserById,
  getUser,
  modifyUser,
  deleteUser,
  updateUserOrgPermission,
} from "../../models/users.models";
import { disableMfa, deleteAllBackupCodes } from "../../models/mfa.models";
import db from "../../database/db";
import {
  createInvitation,
  invalidatePendingInvitations,
} from "../../models/invitations.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import {
  sendAdminInviteEmail,
  sendPasswordResetEmail,
  sendMfaDisabledEmail,
} from "../../utils/email";
import { hashPassword } from "../../utils";

// POST /api/admin/users
export const createUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    console.log("req.body: ", req.body);
    const { email } = req.body;

    const existingUser = await getUser(email);
    if (existingUser) {
      throw { status: 409, msg: "Email already exists" };
    }

    await invalidatePendingInvitations(email, "admin_invite");

    const { invitation, token } = await createInvitation({
      email,
      type: "admin_invite",
    });

    await sendAdminInviteEmail(email, token);

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
    const { is_active, email_verified, limit, offset } = req.query;

    const filters: any = {};
    if (is_active !== undefined) filters.is_active = is_active === "true";
    if (email_verified !== undefined)
      filters.email_verified = email_verified === "true";

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (offset) pagination.offset = parseInt(offset as string);

    const users = await getUsers(filters, pagination);

    return sendSuccess(res, users, "Users retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users/:userId
export const getUserByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;

    const user = await getUserById(userId as string);

    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    return sendSuccess(res, user, "User retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/users/:userId
export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // If password is provided, hash it
    if (updates.password) {
      updates.password_hash = await hashPassword(updates.password);
      delete updates.password;
    }

    const updatedUser = await modifyUser(userId as string, updates);

    return sendSuccess(res, updatedUser, "User updated successfully");
  } catch (error) {
    next(error);
  }
};

export const sendPasswordReset = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;

    const user = await getUserById(userId as string);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    await invalidatePendingInvitations(user.email!, "password_reset");

    const { token } = await createInvitation({
      email: user.email!,
      type: "password_reset",
    });

    await sendPasswordResetEmail(user.email!, token);

    return sendSuccess(res, { email: user.email }, "Password reset email sent");
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/users/:userId
export const deleteUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;

    const deletedUser = await deleteUser(userId as string);

    return sendSuccess(res, deletedUser, "User deleted successfully");
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/users/:userId/org-permission
export const updateOrgPermission = async (
  req: Request,
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
      throw {
        status: 400,
        msg: "can_create_orgs must be true, false, or null",
      };
    }

    const updatedUser = await updateUserOrgPermission(
      userId as string,
      can_create_orgs,
    );

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
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { userId } = req.params;

    const user = await getUserById(userId as string);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    if (!user.mfa_enabled) {
      throw { status: 400, msg: "MFA is not enabled for this user" };
    }

    await disableMfa(userId as string, "user", client);
    await deleteAllBackupCodes(userId as string, "user", client);

    await client.query("COMMIT");

    await sendMfaDisabledEmail(user.email!);

    return sendSuccess(res, null, "MFA disabled for user");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
