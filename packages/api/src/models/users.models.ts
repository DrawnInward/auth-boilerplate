import db from "../database/db";
import { Pool, PoolClient } from "pg";
import { UserStats } from "@auth-boilerplate/shared";
import {
  CreateUserDto,
  GetUsersOptions,
  UserPatchDto,
  User,
  SafeUser,
} from "../types";
import { PaginationOptions } from "../types/PaginationOptions";
import { isUniqueViolation, violatedConstraint } from "../utils/pgErrors";
import { httpError } from "../utils/httpError";
import { buildPatch } from "../utils/sqlPatch";
import { pagedQuery } from "../utils/pagedQuery";

// S10: the projection every general-purpose read and write returns — explicit
// columns, never SELECT/RETURNING *, so credential material (password_hash,
// mfa_secret) cannot leak into a response by default. Secrets leave this table
// only through the explicitly-named getUserWithPassword*/getUserWithMfaStatus
// lookups.
const SAFE_USER_COLUMNS = `user_id, email, email_verified, deleted_at,
  is_active, deactivated_at, deactivated_by, mfa_enabled, google_id,
  auth_provider, created_through, can_create_orgs, created_at, updated_at`;

const USER_PATCH_FIELDS = [
  "email",
  "email_verified",
  "is_active",
  "deactivated_at",
  "deactivated_by",
  "deleted_at",
  "can_create_orgs",
] as const;

export const createUser = async (
  newUser: CreateUserDto,
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  if (!newUser.email || !newUser.password_hash) {
    throw httpError(400, "Email and password_hash are required");
  }

  const queryString = `
    INSERT INTO users
    (email, password_hash, email_verified, is_active, created_through, can_create_orgs)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING ${SAFE_USER_COLUMNS};
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
    return result.rows[0];
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
  options: { includeSoftDeleted?: boolean } = {},
): Promise<SafeUser | null> => {
  let queryString = `
    SELECT ${SAFE_USER_COLUMNS} FROM users
    WHERE email = $1
  `;

  if (!options.includeSoftDeleted) {
    queryString += ` AND deleted_at IS NULL`;
  }

  const result = await db.query(queryString, [email.toLowerCase()]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getUserById = async (
  userId: string,
  client: PoolClient | Pool = db,
): Promise<SafeUser | null> => {
  const queryString = `
    SELECT ${SAFE_USER_COLUMNS} FROM users
    WHERE user_id = $1 AND deleted_at IS NULL;
  `;

  const result = await client.query(queryString, [userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getUsers = async (
  filters: GetUsersOptions = {},
  pagination: PaginationOptions = {},
): Promise<SafeUser[]> => {
  const { text, values } = pagedQuery({
    select: `SELECT ${SAFE_USER_COLUMNS} FROM users`,
    where: ["deleted_at IS NULL"],
    equals: {
      is_active: filters.is_active,
      email_verified: filters.email_verified,
    },
    orderBy: "created_at DESC",
    pagination,
  });

  const result = await db.query(text, values);
  return result.rows;
};

export const getUserWithPassword = async (
  email: string,
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
  userId: string,
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
  detailsToUpdate: UserPatchDto,
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  // Prevent password_hash updates through this function
  if ("password_hash" in detailsToUpdate) {
    throw httpError(
      403,
      "Password updates not allowed. Use updatePassword function instead",
    );
  }
  const patch = buildPatch(detailsToUpdate, USER_PATCH_FIELDS);

  const queryString = `
    UPDATE users
    SET ${[...patch.setClauses(1), "updated_at = NOW()"].join(", ")}
    WHERE user_id = $${patch.values.length + 1} AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  try {
    const result = await client.query(queryString, [...patch.values, userId]);
    if (result.rows.length === 0) {
      throw httpError(404, "User not found");
    }
    return result.rows[0];
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
  client: PoolClient | Pool = db,
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
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
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
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  const result = await client.query(deleteQuery, [userId]);
  return result.rows[0];
};

export const activateUser = async (
  userId: string,
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    UPDATE users
    SET is_active = true, 
        deactivated_at = NULL, 
        deactivated_by = NULL,
        updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  const result = await client.query(queryString, [userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return result.rows[0];
};

export const deactivateUser = async (
  userId: string,
  deactivatorId: string,
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    UPDATE users
    SET is_active = false, 
        deactivated_at = NOW(), 
        deactivated_by = $2,
        updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  const result = await client.query(queryString, [userId, deactivatorId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return result.rows[0];
};

export const verifyUserEmail = async (
  userId: string,
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    UPDATE users
    SET email_verified = true, updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  const result = await client.query(queryString, [userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return result.rows[0];
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
  googleId: string,
): Promise<SafeUser | null> => {
  const queryString = `
    SELECT ${SAFE_USER_COLUMNS} FROM users
    WHERE google_id = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [googleId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const setGoogleId = async (
  userId: string,
  googleId: string,
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    UPDATE users
    SET google_id = $1, updated_at = NOW()
    WHERE user_id = $2 AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  try {
    const result = await client.query(queryString, [googleId, userId]);
    if (result.rows.length === 0) {
      throw httpError(404, "User not found");
    }
    return result.rows[0];
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
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    UPDATE users
    SET auth_provider = $1, updated_at = NOW()
    WHERE user_id = $2 AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  const result = await client.query(queryString, [provider, userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return result.rows[0];
};

export const createGoogleUser = async (
  email: string,
  googleId: string,
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    INSERT INTO users
    (email, google_id, auth_provider, email_verified, is_active)
    VALUES ($1, $2, 'google', true, true)
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  try {
    const result = await client.query(queryString, [
      email.toLowerCase(),
      googleId,
    ]);
    return result.rows[0];
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
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    UPDATE users
    SET google_id = NULL, auth_provider = 'local', updated_at = NOW()
    WHERE user_id = $1 AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  const result = await client.query(queryString, [userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return result.rows[0];
};

export const getUserWithMfaStatus = async (
  email: string,
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
  client: PoolClient | Pool = db,
): Promise<SafeUser> => {
  const queryString = `
    UPDATE users
    SET can_create_orgs = $1, updated_at = NOW()
    WHERE user_id = $2 AND deleted_at IS NULL
    RETURNING ${SAFE_USER_COLUMNS};
  `;

  const result = await client.query(queryString, [canCreateOrgs, userId]);
  if (result.rows.length === 0) {
    throw httpError(404, "User not found");
  }
  return result.rows[0];
};
