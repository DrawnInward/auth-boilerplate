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

export const createAdmin = async (
  newAdmin: CreateAdminDto,
  client: PoolClient | Pool = db
): Promise<Omit<Admin, "password_hash">> => {
  if (!newAdmin.email || !newAdmin.password_hash) {
    throw { status: 400, msg: "Email and password_hash are required" };
  }

  if (newAdmin.root) {
    const existingRootQuery = `
      SELECT admin_id FROM admins 
      WHERE root = true AND deleted_at IS NULL
      LIMIT 1;
    `;
    const existingRoot = await client.query(existingRootQuery);
    if (existingRoot.rows.length > 0) {
      throw { status: 409, msg: "Root admin already exists" };
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
    if (err.code === "23505") {
      throw { status: 409, msg: "Email already exists" };
    }
    throw err;
  }
};

export const getAdmin = async (
  email: string,
  options: { includeSoftDeleted?: boolean } = {}
): Promise<Omit<Admin, "password_hash"> | null> => {
  let queryString = `
    SELECT * FROM admins
    WHERE email = $1
  `;

  if (!options.includeSoftDeleted) {
    queryString += ` AND deleted_at IS NULL`;
  }

  try {
    const result = await db.query(queryString, [email]);
    if (result.rows.length === 0) {
      return null;
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err) {
    throw err;
  }
};

export const getAdminById = async (
  adminId: string
): Promise<Omit<Admin, "password_hash"> | null> => {
  const queryString = `
    SELECT * FROM admins
    WHERE admin_id = $1 AND deleted_at IS NULL;
  `;

  try {
    const result = await db.query(queryString, [adminId]);
    if (result.rows.length === 0) {
      return null;
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err) {
    throw err;
  }
};

export const getAdmins = async (
  filters: GetAdminsOptions = {},
  pagination: PaginationOptions = {}
): Promise<Omit<Admin, "password_hash">[]> => {
  let queryString = `
    SELECT * FROM admins
    WHERE deleted_at IS NULL
  `;

  const values: any[] = [];
  let paramIndex = 1;

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

  if (filters.root !== undefined) {
    queryString += ` AND root = $${paramIndex}`;
    values.push(filters.root);
    paramIndex++;
  }

  queryString += ` ORDER BY created_at DESC`;

  if (pagination.limit) {
    queryString += ` LIMIT $${paramIndex}`;
    values.push(pagination.limit);
    paramIndex++;
  }

  if (pagination.offset) {
    queryString += ` OFFSET $${paramIndex}`;
    values.push(pagination.offset);
  }

  try {
    const result = await db.query(queryString, values);
    return result.rows.map(excludePasswordHash);
  } catch (err) {
    throw err;
  }
};

export const getAdminWithPassword = async (
  email: string
): Promise<Admin | null> => {
  const queryString = `
    SELECT * FROM admins
    WHERE email = $1 AND deleted_at IS NULL;
  `;

  try {
    const result = await db.query(queryString, [email]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  } catch (err) {
    throw err;
  }
};

export const modifyAdmin = async (
  adminId: string,
  detailsToUpdate: UpdateAdminDto,
  client: PoolClient | Pool = db
): Promise<Omit<Admin, "password_hash">> => {
  if ("password_hash" in detailsToUpdate) {
    throw {
      status: 403,
      msg: "Password updates not allowed. Use updateAdminPassword function instead",
    };
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
        throw { status: 409, msg: "Root admin already exists" };
      }
    } else if (detailsToUpdate.root === false) {
      throw {
        status: 409,
        msg: "Cannot remove root status from the only root admin",
      };
    }
  }

  const allowedFields = [
    "email",
    "root",
    "email_verified",
    "is_active",
    "deactivated_at",
    "deactivated_by",
    "deleted_at",
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
    throw { status: 400, msg: "No valid fields to update" };
  }

  updates.push(`updated_at = NOW()`);

  const queryString = `
    UPDATE admins
    SET ${updates.join(", ")}
    WHERE admin_id = $${paramIndex} AND deleted_at IS NULL
    RETURNING *;
  `;

  values.push(adminId);

  try {
    const result = await client.query(queryString, values);
    if (result.rows.length === 0) {
      throw { status: 404, msg: "Admin not found" };
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") {
      throw { status: 409, msg: "Email already exists" };
    }
    throw err;
  }
};

export const updateAdminPassword = async (
  adminId: string,
  newPasswordHash: string,
  client: PoolClient | Pool = db
): Promise<boolean> => {
  const queryString = `
    UPDATE admins
    SET password_hash = $1, updated_at = NOW()
    WHERE admin_id = $2 AND deleted_at IS NULL
    RETURNING admin_id;
  `;

  try {
    const result = await client.query(queryString, [newPasswordHash, adminId]);
    if (result.rows.length === 0) {
      throw { status: 404, msg: "Admin not found" };
    }
    return true;
  } catch (err) {
    throw err;
  }
};

export const deleteAdmin = async (
  adminId: string,
  client: PoolClient | Pool = db
): Promise<Omit<Admin, "password_hash">> => {
  const checkQuery = `
    SELECT deleted_at, root FROM admins WHERE admin_id = $1;
  `;

  try {
    const checkResult = await client.query(checkQuery, [adminId]);

    if (checkResult.rows.length === 0) {
      throw { status: 404, msg: "Admin not found" };
    }

    if (checkResult.rows[0].deleted_at !== null) {
      throw { status: 409, msg: "Admin already deleted" };
    }

    if (checkResult.rows[0].root === true) {
      const rootCountQuery = `
        SELECT COUNT(*) as root_count FROM admins 
        WHERE root = true AND deleted_at IS NULL;
      `;
      const rootCount = await client.query(rootCountQuery);
      if (parseInt(rootCount.rows[0].root_count) === 1) {
        throw { status: 409, msg: "Cannot delete the only root admin" };
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
  } catch (err) {
    throw err;
  }
};

export const activateAdmin = async (
  adminId: string,
  client: PoolClient | Pool = db
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

  try {
    const result = await client.query(queryString, [adminId]);
    if (result.rows.length === 0) {
      throw { status: 404, msg: "Admin not found" };
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err) {
    throw err;
  }
};

export const deactivateAdmin = async (
  adminId: string,
  deactivatorId: string,
  client: PoolClient | Pool = db
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
      throw {
        status: 409,
        msg: "Cannot deactivate the only active root admin",
      };
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

  try {
    const result = await client.query(queryString, [adminId, deactivatorId]);
    if (result.rows.length === 0) {
      throw { status: 404, msg: "Admin not found" };
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err) {
    throw err;
  }
};

export const verifyAdminEmail = async (
  adminId: string,
  client: PoolClient | Pool = db
): Promise<Omit<Admin, "password_hash">> => {
  const queryString = `
    UPDATE admins
    SET email_verified = true, updated_at = NOW()
    WHERE admin_id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  try {
    const result = await client.query(queryString, [adminId]);
    if (result.rows.length === 0) {
      throw { status: 404, msg: "Admin not found" };
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err) {
    throw err;
  }
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

  try {
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
  } catch (err) {
    throw err;
  }
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

  try {
    const result = await db.query(queryString);
    if (result.rows.length === 0) {
      return null;
    }
    return excludePasswordHash(result.rows[0]);
  } catch (err) {
    throw err;
  }
};
