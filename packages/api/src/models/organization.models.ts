import db from "../database/db";
import { Pool, PoolClient } from "pg";

import { PaginationOptions } from "../types/PaginationOptions";
import {
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  GetOrganizationsOptions,
  OrganizationStats,
  OrganizationWithMemberCount,
  OrganizationWithRole,
} from "@auth-boilerplate/shared";

export const createOrganization = async (
  newOrg: CreateOrganizationDto & { owner_id: string },
  client: PoolClient | Pool = db,
): Promise<Organization> => {
  if (!newOrg.owner_id || !newOrg.name) {
    throw {
      status: 400,
      msg: "owner_id and name are required",
    };
  }

  // Generate slug from name if not provided
  const slug =
    newOrg.slug ||
    newOrg.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const queryString = `
    INSERT INTO organizations
    (name, slug, owner_id)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;

  const values = [newOrg.name, slug, newOrg.owner_id];

  try {
    const result = await client.query(queryString, values);
    return result.rows[0];
  } catch (err: any) {
    if (err.code === "23505") {
      throw { status: 409, msg: "Organization slug already exists" };
    }
    if (err.code === "23503") {
      throw { status: 400, msg: "Invalid owner_id" };
    }
    throw err;
  }
};

export const getOrganizationBySlug = async (
  slug: string,
): Promise<Organization | null> => {
  const queryString = `
    SELECT * FROM organizations
    WHERE slug = $1;
  `;

  const result = await db.query(queryString, [slug]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getOrganizationById = async (
  id: string,
): Promise<Organization | null> => {
  const queryString = `
    SELECT * FROM organizations
    WHERE id = $1;
  `;

  const result = await db.query(queryString, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getOrganizations = async (
  filters: GetOrganizationsOptions = {},
  pagination: PaginationOptions = {},
): Promise<Organization[]> => {
  let queryString = `
    SELECT DISTINCT o.* FROM organizations o
  `;

  const values: any[] = [];
  let paramIndex = 1;

  // Join with members if filtering by user_id (membership)
  if (filters.user_id !== undefined) {
    queryString += ` JOIN organization_members om ON o.id = om.organization_id`;
  }

  queryString += ` WHERE 1=1`;

  if (filters.owner_id !== undefined) {
    queryString += ` AND o.owner_id = $${paramIndex}`;
    values.push(filters.owner_id);
    paramIndex++;
  }

  if (filters.user_id !== undefined) {
    queryString += ` AND om.user_id = $${paramIndex}`;
    values.push(filters.user_id);
    paramIndex++;
  }

  queryString += ` ORDER BY o.created_at DESC`;

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
  return result.rows;
};

export const getOrganizationsByUserId = async (
  userId: string,
  pagination: PaginationOptions = {},
): Promise<OrganizationWithRole[]> => {
  let queryString = `
    SELECT o.*, om.role
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    WHERE om.user_id = $1
    ORDER BY o.created_at DESC
  `;

  const values: any[] = [userId];
  let paramIndex = 2;

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
  return result.rows;
};

export const modifyOrganization = async (
  id: string,
  detailsToUpdate: UpdateOrganizationDto,
  client: PoolClient | Pool = db,
): Promise<Organization> => {
  const allowedFields = ["name", "slug"];

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

  // Always update updated_at
  updates.push(`updated_at = NOW()`);

  const queryString = `
    UPDATE organizations
    SET ${updates.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *;
  `;

  values.push(id);

  try {
    const result = await client.query(queryString, values);
    if (result.rows.length === 0) {
      throw { status: 404, msg: "Organization not found" };
    }
    return result.rows[0];
  } catch (err: any) {
    if (err.code === "23505") {
      throw { status: 409, msg: "Organization slug already exists" };
    }
    throw err;
  }
};

export const deleteOrganization = async (
  id: string,
  client: PoolClient | Pool = db,
): Promise<Organization> => {
  const queryString = `
    DELETE FROM organizations
    WHERE id = $1
    RETURNING *;
  `;

  const result = await client.query(queryString, [id]);
  if (result.rows.length === 0) {
    throw { status: 404, msg: "Organization not found" };
  }
  return result.rows[0];
};

export const getOrganizationStats = async (): Promise<OrganizationStats> => {
  const queryString = `
    SELECT
      COUNT(DISTINCT o.id) as total,
      COUNT(om.id) as total_members,
      COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days') as created_last_30_days
    FROM organizations o
    LEFT JOIN organization_members om ON o.id = om.organization_id;
  `;

  const result = await db.query(queryString);
  const stats = result.rows[0];

  return {
    total: parseInt(stats.total),
    total_members: parseInt(stats.total_members),
    created_last_30_days: parseInt(stats.created_last_30_days),
  };
};

export const getOrganizationWithMemberCount = async (
  id: string,
): Promise<OrganizationWithMemberCount | null> => {
  const queryString = `
    SELECT
      o.*,
      COUNT(om.id) as member_count
    FROM organizations o
    LEFT JOIN organization_members om ON o.id = om.organization_id
    WHERE o.id = $1
    GROUP BY o.id;
  `;

  const result = await db.query(queryString, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return {
    ...result.rows[0],
    member_count: parseInt(result.rows[0].member_count),
  };
};
