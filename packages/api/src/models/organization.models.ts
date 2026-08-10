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
import { isUniqueViolation, isForeignKeyViolation } from "../utils/pgErrors";
import { httpError } from "../utils/httpError";
import { buildPatch } from "../utils/sqlPatch";
import { pagedQuery } from "../utils/pagedQuery";

const ORGANIZATION_PATCH_FIELDS = ["name", "slug"] as const;

export const createOrganization = async (
  newOrg: CreateOrganizationDto & { owner_id: string },
  client: PoolClient | Pool = db,
): Promise<Organization> => {
  if (!newOrg.owner_id || !newOrg.name) {
    throw httpError(400, "owner_id and name are required");
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
    if (isUniqueViolation(err)) {
      throw httpError(409, "Organization slug already exists");
    }
    if (isForeignKeyViolation(err)) {
      throw httpError(400, "Invalid owner_id");
    }
    throw err;
  }
};

export const getOrganizationBySlug = async (
  slug: string,
): Promise<Organization | null> => {
  const queryString = `
    SELECT * FROM organizations
    WHERE slug = $1 AND deleted_at IS NULL;
  `;

  const result = await db.query(queryString, [slug]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getOrganizationById = async (
  id: string,
  client: PoolClient | Pool = db,
): Promise<Organization | null> => {
  const queryString = `
    SELECT * FROM organizations
    WHERE id = $1 AND deleted_at IS NULL;
  `;

  const result = await client.query(queryString, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getOrganizations = async (
  filters: GetOrganizationsOptions = {},
  pagination: PaginationOptions = {},
): Promise<Organization[]> => {
  // Membership filtering needs the join; owner-only filtering does not.
  const select =
    filters.user_id !== undefined
      ? `SELECT DISTINCT o.* FROM organizations o
         JOIN organization_members om ON o.id = om.organization_id`
      : `SELECT DISTINCT o.* FROM organizations o`;

  const { text, values } = pagedQuery({
    select,
    where: ["o.deleted_at IS NULL"],
    equals: {
      "o.owner_id": filters.owner_id,
      "om.user_id": filters.user_id,
    },
    orderBy: "o.created_at DESC",
    pagination,
  });

  const result = await db.query(text, values);
  return result.rows;
};

export const getOrganizationsByUserId = async (
  userId: string,
  pagination: PaginationOptions = {},
): Promise<OrganizationWithRole[]> => {
  const { text, values } = pagedQuery({
    select: `SELECT o.*, om.role
             FROM organizations o
             JOIN organization_members om ON o.id = om.organization_id`,
    where: ["o.deleted_at IS NULL"],
    equals: { "om.user_id": userId },
    orderBy: "o.created_at DESC",
    pagination,
  });

  const result = await db.query(text, values);
  return result.rows;
};

export const modifyOrganization = async (
  id: string,
  detailsToUpdate: UpdateOrganizationDto,
  client: PoolClient | Pool = db,
): Promise<Organization> => {
  const patch = buildPatch(detailsToUpdate, ORGANIZATION_PATCH_FIELDS);

  const queryString = `
    UPDATE organizations
    SET ${[...patch.setClauses(1), "updated_at = NOW()"].join(", ")}
    WHERE id = $${patch.values.length + 1} AND deleted_at IS NULL
    RETURNING *;
  `;

  try {
    const result = await client.query(queryString, [...patch.values, id]);
    if (result.rows.length === 0) {
      throw httpError(404, "Organization not found");
    }
    return result.rows[0];
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw httpError(409, "Organization slug already exists");
    }
    throw err;
  }
};

// Soft delete: the row persists (downstream consumers reference organizations
// forever); membership rows persist too, but every org read filters
// deleted_at, so the org-scoped middleware 404s from here on.
export const deleteOrganization = async (
  id: string,
  client: PoolClient | Pool = db,
): Promise<Organization> => {
  const queryString = `
    UPDATE organizations
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [id]);
  if (result.rows.length === 0) {
    throw httpError(404, "Organization not found");
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
    LEFT JOIN organization_members om ON o.id = om.organization_id
    WHERE o.deleted_at IS NULL;
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
    WHERE o.id = $1 AND o.deleted_at IS NULL
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
