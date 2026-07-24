import db from "../database/db";
import { Pool, PoolClient } from "pg";
import {
  CreateUserDto,
  GetUsersOptions,
  UpdateUserDto,
  User,
  UserStats,
} from "../types";
import { PaginationOptions } from "../types/PaginationOptions";
import { excludePasswordHash } from "../utils";
import { isUniqueViolation, violatedConstraint } from "../utils/pgErrors";
import { httpError } from "../utils/httpError";

export const createUser = async (
  newUser: CreateUserDto,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  if (!newUser.email || !newUser.password_hash) {
    throw httpError(400, "Email and password_hash are required");
  }

  const queryString = `
    INSERT INTO users
    (email, password_hash, email_verified, is_active, created_through, can_create_orgs)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  const values = [
    newUser.email.toLowerCase(),
    newUser.password_hash,
    newUser.email_verified || false,
    newUser.is_active !== undefined ? newUser.is_active : true,
    newUser.created_through || "self_registered",
    newUser.can_create_orgs ?? null,
  ];

  try {
    const result = await client.query(queryString, values);
    return excludePasswordHash(result.rows[0]);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      // Unique constraint violation
      throw httpError(409, "Email already exists");
    }
    throw err;
  }
};

export const getUser = async (
  email: string,
  options: { includeSoftDeleted?: boolean } = {}
): Promise<Omit<User, "password_hash"> | null> => {
  let queryString = `
    SELECT * FROM users
    WHERE email = $1
  `;

  if (!options.includeSoftDeleted) {
    queryString += ` AND deleted_at IS NULL`;
  }

  const result = await db.query(queryString, [email.toLowerCase()]);
  if (result.rows.length === 0) {
    return null;
  }
  return excludePasswordHash(result.rows[0]);
};

export const getUserById = async (
  userId: string
): Promise<Omit<User, "password_hash"> | null> => {
  const queryString = `
    SELECT * FROM users
    WHERE user_id = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return excludePasswordHash(result.rows[0]);
};

export const getUsers = async (
  filters: GetUsersOptions = {},
  pagination: PaginationOptions = {}
): Promise<Omit<User, "password_hash">[]> => {
  let queryString = `
    SELECT * FROM users
    WHERE deleted_at IS NULL
  `;

  const values: any[] = [];
  let paramIndex = 1;

  // Add filters
  if (filters.is_active !== undefined) {
    queryString += ` AND is_active = $${paramIndex}`;
    values.push(filters.is_active);
    paramIndex++;
  }

  if (filters.email_verified !== undefined) {
    queryString += ` AND email_verified = $${paramIndex}`;
    values.push(filters.email_verified);
    paramIndex++;
  }

  queryString += ` ORDER BY created_at DESC`;

  // Add pagination
  if (pagination.limit) {
    queryString += ` LIMIT $${paramIndex}`;
    values.push(pagination.limit);
    paramIndex++;
  }

  if (pagination.offset) {
    queryString += ` OFFSET $${paramIndex}`;
    values.push(pagination.offset);
  }

  const result = await db.query(queryString, values);
  return result.rows.map(excludePasswordHash);
};

export const getUserWithPassword = async (
  email: string
): Promise<User | null> => {
  const queryString = `
    SELECT * FROM users
    WHERE email = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [email.toLowerCase()]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getUserWithPasswordById = async (
  userId: string
): Promise<User | null> => {
  const queryString = `
    SELECT * FROM users
    WHERE user_id = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const modifyUser = async (
  userId: string,
  detailsToUpdate: UpdateUserDto,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  // Prevent password_hash updates through this function
  if ("password_hash" in detailsToUpdate) {
    throw httpError(403, "Password updates not allowed. Use updatePassword function instead");
  }
  const allowedFields = [
    "email",
    "email_verified",
    "is_active",
    "deactivated_at",
    "deactivated_by",
    "deleted_at",
    "can_create_orgs",
  ];
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(detailsToUpdate).forEach(([key, value]) => {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (updates.length === 0) {
    throw httpError(400, "No valid fields to update");
  }

  updates.push(`updated_at = NOW()`);

  const queryString = `
    UPDATE users
    SET ${updates.join(", ")}
    WHERE user_id = $${paramIndex} AND deleted_at IS NULL
    RETURNING *;
  `;

  values.push(userId);

  try {
    const result = await client.query(queryString, values);
    if (result.rows.length === 0) {
      throw httpError(404, "User not found");
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      // Unique constraint violation
      throw httpError(409, "Email already exists");
    }
    throw err;
  }
};

export const updatePassword = async (
  userId: string,
  newPasswordHash: string,
  client: PoolClient | Pool = db
): Promise<boolean> => {
  const queryString = `
    UPDATE users
    SET password_hash = $1, updated_at = NOW()
    WHERE user_id = $2 AND deleted_at IS NULL
    RETURNING user_id;
  `;

  const result = await client.query(queryString, [newPasswordHash, userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return true;
};

export const deleteUser = async (
  userId: string,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const checkQuery = `
    SELECT deleted_at FROM users WHERE user_id = $1;
  `;

  const checkResult = await client.query(checkQuery, [userId]);

  if (checkResult.rows.length === 0) {
    throw httpError(404, "User not found");
  }

  if (checkResult.rows[0].deleted_at !== null) {
    throw httpError(409, "User already deleted");
  }

  // Perform soft delete
  const deleteQuery = `
    UPDATE users
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE user_id = $1
    RETURNING *;
  `;

  const result = await client.query(deleteQuery, [userId]);
  return excludePasswordHash(result.rows[0]);
};

export const activateUser = async (
  userId: string,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    UPDATE users
    SET is_active = true, 
        deactivated_at = NULL, 
        deactivated_by = NULL,
        updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const deactivateUser = async (
  userId: string,
  deactivatorId: string,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    UPDATE users
    SET is_active = false, 
        deactivated_at = NOW(), 
        deactivated_by = $2,
        updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [userId, deactivatorId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const verifyUserEmail = async (
  userId: string,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    UPDATE users
    SET email_verified = true, updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const getUserStats = async (): Promise<UserStats> => {
  const queryString = `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL) as active,
      COUNT(*) FILTER (WHERE is_active = false AND deleted_at IS NULL) as inactive,
      COUNT(*) FILTER (WHERE email_verified = true AND deleted_at IS NULL) as verified,
      COUNT(*) FILTER (WHERE email_verified = false AND deleted_at IS NULL) as unverified,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted
    FROM users;
  `;

  const result = await db.query(queryString);
  const stats = result.rows[0];

  return {
    total: parseInt(stats.total),
    active: parseInt(stats.active),
    inactive: parseInt(stats.inactive),
    verified: parseInt(stats.verified),
    unverified: parseInt(stats.unverified),
    deleted: parseInt(stats.deleted),
  };
};

export type AuthProvider = "local" | "google" | "both";

export const getUserByGoogleId = async (
  googleId: string
): Promise<Omit<User, "password_hash"> | null> => {
  const queryString = `
    SELECT * FROM users
    WHERE google_id = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [googleId]);
  if (result.rows.length === 0) {
    return null;
  }
  return excludePasswordHash(result.rows[0]);
};

export const setGoogleId = async (
  userId: string,
  googleId: string,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    UPDATE users
    SET google_id = $1, updated_at = NOW()
    WHERE user_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;

  try {
    const result = await client.query(queryString, [googleId, userId]);
    if (result.rows.length === 0) {
      throw httpError(404, "User not found");
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw httpError(409, "Google account already linked to another user");
    }
    throw err;
  }
};

export const setAuthProvider = async (
  userId: string,
  provider: AuthProvider,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    UPDATE users
    SET auth_provider = $1, updated_at = NOW()
    WHERE user_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [provider, userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const createGoogleUser = async (
  email: string,
  googleId: string,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    INSERT INTO users
    (email, google_id, auth_provider, email_verified, is_active)
    VALUES ($1, $2, 'google', true, true)
    RETURNING *;
  `;

  try {
    const result = await client.query(queryString, [email.toLowerCase(), googleId]);
    return excludePasswordHash(result.rows[0]);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      if (violatedConstraint(err)?.includes("google_id")) {
        throw httpError(409, "Google account already linked to another user");
      }
      throw httpError(409, "Email already exists");
    }
    throw err;
  }
};

export const unlinkGoogleAccount = async (
  userId: string,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    UPDATE users
    SET google_id = NULL, auth_provider = 'local', updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const getUserWithMfaStatus = async (
  email: string
): Promise<(User & { mfa_enabled: boolean }) | null> => {
  const queryString = `
    SELECT * FROM users
    WHERE email = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [email.toLowerCase()]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const updateUserOrgPermission = async (
  userId: string,
  canCreateOrgs: boolean | null,
  client: PoolClient | Pool = db
): Promise<Omit<User, "password_hash">> => {
  const queryString = `
    UPDATE users
    SET can_create_orgs = $1, updated_at = NOW()
    WHERE user_id = $2 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [canCreateOrgs, userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return excludePasswordHash(result.rows[0]);
};
