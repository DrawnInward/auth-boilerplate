import db from "../database/db";
import { Pool, PoolClient } from "pg";
import {
  CreateAdminDto,
  GetAdminsOptions,
  UpdateAdminDto,
  Admin,
  AdminStats,
} from "../types";
import { PaginationOptions } from "../types/PaginationOptions";
import { excludePasswordHash } from "../utils";
import { isUniqueViolation } from "../utils/pgErrors";
import { httpError } from "../utils/httpError";
import { buildPatch } from "../utils/sqlPatch";
import { pagedQuery } from "../utils/pagedQuery";

const ADMIN_PATCH_FIELDS = [
  "email",
  "root",
  "email_verified",
  "is_active",
  "deactivated_at",
  "deactivated_by",
  "deleted_at",
] as const;

export const createAdmin = async (
  newAdmin: CreateAdminDto,
  client: PoolClient | Pool = db,
): Promise<Omit<Admin, "password_hash">> => {
  if (!newAdmin.email || !newAdmin.password_hash) {
    throw httpError(400, "Email and password_hash are required");
  }

  if (newAdmin.root) {
    const existingRootQuery = `
      SELECT admin_id FROM admins 
      WHERE root = true AND deleted_at IS NULL
      LIMIT 1;
    `;
    const existingRoot = await client.query(existingRootQuery);
    if (existingRoot.rows.length > 0) {
      throw httpError(409, "Root admin already exists");
    }
  }

  const queryString = `
    INSERT INTO admins
    (email, password_hash, root, email_verified, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const values = [
    newAdmin.email,
    newAdmin.password_hash,
    newAdmin.root || false,
    newAdmin.email_verified || false,
    newAdmin.is_active !== undefined ? newAdmin.is_active : true,
  ];

  try {
    const result = await client.query(queryString, values);
    return excludePasswordHash(result.rows[0]);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw httpError(409, "Email already exists");
    }
    throw err;
  }
};

export const getAdmin = async (
  email: string,
  options: { includeSoftDeleted?: boolean } = {},
): Promise<Omit<Admin, "password_hash"> | null> => {
  let queryString = `
    SELECT * FROM admins
    WHERE email = $1
  `;

  if (!options.includeSoftDeleted) {
    queryString += ` AND deleted_at IS NULL`;
  }

  const result = await db.query(queryString, [email]);
  if (result.rows.length === 0) {
    return null;
  }
  return excludePasswordHash(result.rows[0]);
};

export const getAdminById = async (
  adminId: string,
): Promise<Omit<Admin, "password_hash"> | null> => {
  const queryString = `
    SELECT * FROM admins
    WHERE admin_id = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [adminId]);
  if (result.rows.length === 0) {
    return null;
  }
  return excludePasswordHash(result.rows[0]);
};

export const getAdmins = async (
  filters: GetAdminsOptions = {},
  pagination: PaginationOptions = {},
): Promise<Omit<Admin, "password_hash">[]> => {
  const { text, values } = pagedQuery({
    select: "SELECT * FROM admins",
    where: ["deleted_at IS NULL"],
    equals: {
      is_active: filters.is_active,
      email_verified: filters.email_verified,
      root: filters.root,
    },
    orderBy: "created_at DESC",
    pagination,
  });

  const result = await db.query(text, values);
  return result.rows.map(excludePasswordHash);
};

export const getAdminWithPassword = async (
  email: string,
): Promise<Admin | null> => {
  const queryString = `
    SELECT * FROM admins
    WHERE email = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [email]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const modifyAdmin = async (
  adminId: string,
  detailsToUpdate: UpdateAdminDto,
  client: PoolClient | Pool = db,
): Promise<Omit<Admin, "password_hash">> => {
  if ("password_hash" in detailsToUpdate) {
    throw httpError(
      403,
      "Password updates not allowed. Use updateAdminPassword function instead",
    );
  }

  if ("root" in detailsToUpdate) {
    if (detailsToUpdate.root === true) {
      const existingRootQuery = `
        SELECT admin_id FROM admins 
        WHERE root = true AND deleted_at IS NULL AND admin_id != $1
        LIMIT 1;
      `;
      const existingRoot = await client.query(existingRootQuery, [adminId]);
      if (existingRoot.rows.length > 0) {
        throw httpError(409, "Root admin already exists");
      }
    } else if (detailsToUpdate.root === false) {
      throw httpError(
        409,
        "Cannot remove root status from the only root admin",
      );
    }
  }

  const patch = buildPatch(detailsToUpdate, ADMIN_PATCH_FIELDS);

  const queryString = `
    UPDATE admins
    SET ${[...patch.setClauses(1), "updated_at = NOW()"].join(", ")}
    WHERE admin_id = $${patch.values.length + 1} AND deleted_at IS NULL
    RETURNING *;
  `;

  try {
    const result = await client.query(queryString, [...patch.values, adminId]);
    if (result.rows.length === 0) {
      throw httpError(404, "Admin not found");
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw httpError(409, "Email already exists");
    }
    throw err;
  }
};

export const updateAdminPassword = async (
  adminId: string,
  newPasswordHash: string,
  client: PoolClient | Pool = db,
): Promise<boolean> => {
  const queryString = `
    UPDATE admins
    SET password_hash = $1, updated_at = NOW()
    WHERE admin_id = $2 AND deleted_at IS NULL
    RETURNING admin_id;
  `;

  const result = await client.query(queryString, [newPasswordHash, adminId]);
  if (result.rows.length === 0) {
    throw httpError(404, "Admin not found");
  }
  return true;
};

export const deleteAdmin = async (
  adminId: string,
  client: PoolClient | Pool = db,
): Promise<Omit<Admin, "password_hash">> => {
  const checkQuery = `
    SELECT deleted_at, root FROM admins WHERE admin_id = $1;
  `;

  const checkResult = await client.query(checkQuery, [adminId]);

  if (checkResult.rows.length === 0) {
    throw httpError(404, "Admin not found");
  }

  if (checkResult.rows[0].deleted_at !== null) {
    throw httpError(409, "Admin already deleted");
  }

  if (checkResult.rows[0].root === true) {
    const rootCountQuery = `
      SELECT COUNT(*) as root_count FROM admins 
      WHERE root = true AND deleted_at IS NULL;
    `;
    const rootCount = await client.query(rootCountQuery);
    if (parseInt(rootCount.rows[0].root_count) === 1) {
      throw httpError(409, "Cannot delete the only root admin");
    }
  }

  const deleteQuery = `
    UPDATE admins
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE admin_id = $1
    RETURNING *;
  `;

  const result = await client.query(deleteQuery, [adminId]);
  return excludePasswordHash(result.rows[0]);
};

export const activateAdmin = async (
  adminId: string,
  client: PoolClient | Pool = db,
): Promise<Omit<Admin, "password_hash">> => {
  const queryString = `
    UPDATE admins
    SET is_active = true, 
        deactivated_at = NULL, 
        deactivated_by = NULL,
        updated_at = NOW()
    WHERE admin_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [adminId]);
  if (result.rows.length === 0) {
    throw httpError(404, "Admin not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const deactivateAdmin = async (
  adminId: string,
  deactivatorId: string,
  client: PoolClient | Pool = db,
): Promise<Omit<Admin, "password_hash">> => {
  const checkRootQuery = `
    SELECT root FROM admins 
    WHERE admin_id = $1 AND deleted_at IS NULL;
  `;
  const adminCheck = await client.query(checkRootQuery, [adminId]);

  if (adminCheck.rows[0]?.root === true) {
    const rootCountQuery = `
      SELECT COUNT(*) as root_count FROM admins 
      WHERE root = true AND deleted_at IS NULL AND is_active = true;
    `;
    const rootCount = await client.query(rootCountQuery);
    if (parseInt(rootCount.rows[0].root_count) === 1) {
      throw httpError(409, "Cannot deactivate the only active root admin");
    }
  }

  const queryString = `
    UPDATE admins
    SET is_active = false, 
        deactivated_at = NOW(), 
        deactivated_by = $2,
        updated_at = NOW()
    WHERE admin_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [adminId, deactivatorId]);
  if (result.rows.length === 0) {
    throw httpError(404, "Admin not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const verifyAdminEmail = async (
  adminId: string,
  client: PoolClient | Pool = db,
): Promise<Omit<Admin, "password_hash">> => {
  const queryString = `
    UPDATE admins
    SET email_verified = true, updated_at = NOW()
    WHERE admin_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [adminId]);
  if (result.rows.length === 0) {
    throw httpError(404, "Admin not found");
  }
  return excludePasswordHash(result.rows[0]);
};

export const getAdminStats = async (): Promise<AdminStats> => {
  const queryString = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL) as active,
      COUNT(*) FILTER (WHERE is_active = false AND deleted_at IS NULL) as inactive,
      COUNT(*) FILTER (WHERE email_verified = true AND deleted_at IS NULL) as verified,
      COUNT(*) FILTER (WHERE email_verified = false AND deleted_at IS NULL) as unverified,
      COUNT(*) FILTER (WHERE root = true AND deleted_at IS NULL) as root_admins,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted
    FROM admins;
  `;

  const result = await db.query(queryString);
  const stats = result.rows[0];

  return {
    total: parseInt(stats.total),
    active: parseInt(stats.active),
    inactive: parseInt(stats.inactive),
    verified: parseInt(stats.verified),
    unverified: parseInt(stats.unverified),
    root_admins: parseInt(stats.root_admins),
    deleted: parseInt(stats.deleted),
  };
};

export const getRootAdmin = async (): Promise<Omit<
  Admin,
  "password_hash"
> | null> => {
  const queryString = `
    SELECT * FROM admins
    WHERE root = true AND deleted_at IS NULL
    LIMIT 1;
  `;

  const result = await db.query(queryString);
  if (result.rows.length === 0) {
    return null;
  }
  return excludePasswordHash(result.rows[0]);
};

export const getAdminWithMfaStatus = async (
  email: string,
): Promise<(Admin & { mfa_enabled: boolean }) | null> => {
  const queryString = `
    SELECT * FROM admins
    WHERE email = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [email]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};
