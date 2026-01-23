import { Request, Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import {
  createUser,
  getUsers,
  getUserById,
  modifyUser,
  deleteUser,
  updatePassword,
} from "../../models/users.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { hashPassword } from "../../utils";

// POST /api/admin/users
export const createUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password, email_verified, is_active } = req.body;

    if (!password) {
      throw { status: 400, msg: "Password is required" };
    }

    // Hash the password
    const password_hash = await hashPassword(password);

    const newUser = await createUser({
      email,
      password_hash,
      email_verified,
      is_active,
    });

    return sendCreated(res, newUser, "User created successfully");
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

export const changeUserPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.params;
    const password = req.body.password;
    let password_hash;

    // If password is provided, hash it
    if (password) {
      password_hash = await hashPassword(password);
      delete req.body.password;
    } else {
      throw { status: 404, msg: "Password not Found" };
    }

    const updatedUser = await updatePassword(userId as string, password_hash);

    return sendSuccess(res, updatedUser, "Password updated successfully");
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
