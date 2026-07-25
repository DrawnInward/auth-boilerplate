import db from "../database/db";
import { Pool, PoolClient } from "pg";

import { PaginationOptions } from "../types/PaginationOptions";
import {
  OrganizationMember,
  OrganizationRoleType,
  AddOrganizationMemberDto,
} from "@auth-boilerplate/shared";
import { isUniqueViolation, isForeignKeyViolation } from "../utils/pgErrors";
import { httpError } from "../utils/httpError";
import { pagedQuery } from "../utils/pagedQuery";

export interface OrganizationMemberWithUser extends OrganizationMember {
  email: string;
}

export const addOrganizationMember = async (
  organizationId: string,
  memberData: AddOrganizationMemberDto,
  invitedBy: string | null = null,
  client: PoolClient | Pool = db,
): Promise<OrganizationMember> => {
  if (!memberData.user_id) {
    throw httpError(400, "user_id is required");
  }

  const queryString = `
    INSERT INTO organization_members
    (organization_id, user_id, role, invited_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;

  const values = [
    organizationId,
    memberData.user_id,
    memberData.role || "member",
    invitedBy,
  ];

  try {
    const result = await client.query(queryString, values);
    return result.rows[0];
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw httpError(409, "User is already a member of this organization");
    }
    if (isForeignKeyViolation(err)) {
      throw httpError(400, "Invalid organization_id or user_id");
    }
    throw err;
  }
};

export const getOrganizationMember = async (
  organizationId: string,
  userId: string,
): Promise<OrganizationMember | null> => {
  const queryString = `
    SELECT * FROM organization_members
    WHERE organization_id = $1 AND user_id = $2;
  `;

  const result = await db.query(queryString, [organizationId, userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getOrganizationMemberById = async (
  memberId: string,
): Promise<OrganizationMember | null> => {
  const queryString = `
    SELECT * FROM organization_members
    WHERE id = $1;
  `;

  const result = await db.query(queryString, [memberId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getOrganizationMembers = async (
  organizationId: string,
  pagination: PaginationOptions = {},
): Promise<OrganizationMemberWithUser[]> => {
  const { text, values } = pagedQuery({
    select: `SELECT om.*, u.email
             FROM organization_members om
             JOIN users u ON om.user_id = u.user_id`,
    equals: { "om.organization_id": organizationId },
    orderBy: "om.joined_at DESC",
    pagination,
  });

  const result = await db.query(text, values);
  return result.rows;
};

export const getUserMemberships = async (
  userId: string,
  pagination: PaginationOptions = {},
): Promise<OrganizationMember[]> => {
  const { text, values } = pagedQuery({
    select: "SELECT * FROM organization_members",
    equals: { user_id: userId },
    orderBy: "joined_at DESC",
    pagination,
  });

  const result = await db.query(text, values);
  return result.rows;
};

export const updateMemberRole = async (
  organizationId: string,
  userId: string,
  newRole: OrganizationRoleType,
  client: PoolClient | Pool = db,
): Promise<OrganizationMember> => {
  // Prevent changing owner role directly (use transfer ownership instead)
  if (newRole === "owner") {
    throw httpError(
      400,
      "Cannot set role to owner directly. Use transfer ownership.",
    );
  }

  const queryString = `
    UPDATE organization_members
    SET role = $1
    WHERE organization_id = $2 AND user_id = $3 AND role != 'owner'
    RETURNING *;
  `;

  try {
    const result = await client.query(queryString, [
      newRole,
      organizationId,
      userId,
    ]);
    if (result.rows.length === 0) {
      throw httpError(404, "Member not found or cannot modify owner role");
    }
    return result.rows[0];
  } catch (err: any) {
    if (err.status) throw err;
    throw err;
  }
};

export const removeOrganizationMember = async (
  organizationId: string,
  userId: string,
  client: PoolClient | Pool = db,
): Promise<OrganizationMember> => {
  const member = await getOrganizationMember(organizationId, userId);
  if (!member) {
    throw httpError(404, "Member not found");
  }
  if (member.role === "owner") {
    throw httpError(
      400,
      "Cannot remove owner from organization. Transfer ownership first.",
    );
  }

  const queryString = `
    DELETE FROM organization_members
    WHERE organization_id = $1 AND user_id = $2
    RETURNING *;
  `;

  try {
    const result = await client.query(queryString, [organizationId, userId]);
    if (result.rows.length === 0) {
      throw httpError(404, "Member not found");
    }
    return result.rows[0];
  } catch (err: any) {
    if (err.status) throw err;
    throw err;
  }
};

export const transferOwnership = async (
  organizationId: string,
  currentOwnerId: string,
  newOwnerId: string,
  client: PoolClient | Pool = db,
): Promise<{ oldOwner: OrganizationMember; newOwner: OrganizationMember }> => {
  // Verify new owner is already a member
  const newOwnerMember = await getOrganizationMember(
    organizationId,
    newOwnerId,
  );
  if (!newOwnerMember) {
    throw httpError(
      400,
      "New owner must be an existing member of the organization",
    );
  }

  const demoteQuery = `
    UPDATE organization_members
    SET role = 'admin'
    WHERE organization_id = $1 AND user_id = $2 AND role = 'owner'
    RETURNING *;
  `;

  const promoteQuery = `
    UPDATE organization_members
    SET role = 'owner'
    WHERE organization_id = $1 AND user_id = $2
    RETURNING *;
  `;

  const updateOrgQuery = `
    UPDATE organizations
    SET owner_id = $1, updated_at = NOW()
    WHERE id = $2;
  `;

  try {
    const demoteResult = await client.query(demoteQuery, [
      organizationId,
      currentOwnerId,
    ]);
    if (demoteResult.rows.length === 0) {
      throw httpError(403, "Only current owner can transfer ownership");
    }

    const promoteResult = await client.query(promoteQuery, [
      organizationId,
      newOwnerId,
    ]);
    await client.query(updateOrgQuery, [newOwnerId, organizationId]);

    return {
      oldOwner: demoteResult.rows[0],
      newOwner: promoteResult.rows[0],
    };
  } catch (err: any) {
    if (err.status) throw err;
    throw err;
  }
};

export const getMemberCount = async (
  organizationId: string,
): Promise<number> => {
  const queryString = `
    SELECT COUNT(*) as count
    FROM organization_members
    WHERE organization_id = $1;
  `;

  const result = await db.query(queryString, [organizationId]);
  return parseInt(result.rows[0].count);
};

export const isUserMemberOfOrg = async (
  organizationId: string,
  userId: string,
): Promise<boolean> => {
  const member = await getOrganizationMember(organizationId, userId);
  return member !== null;
};

export const getUserRoleInOrg = async (
  organizationId: string,
  userId: string,
): Promise<OrganizationRoleType | null> => {
  const member = await getOrganizationMember(organizationId, userId);
  return member?.role || null;
};
