import db from "../database/db";
import { Pool, PoolClient } from "pg";
import { v4 as uuidv4 } from "uuid";
import { Invitation, CreateInvitationDto, InvitationType } from "../types";
import { determinateHash } from "../utils";
import { PaginationOptions } from "../types/PaginationOptions";
import { isUniqueViolation } from "../utils/pgErrors";
import { httpError } from "../utils/httpError";

const EXPIRY_TIMES: Record<InvitationType, number> = {
  registration: 24 * 60 * 60 * 1000, // 24 hours
  org_invite: 7 * 24 * 60 * 60 * 1000, // 7 days
  password_reset: 60 * 60 * 1000, // 1 hour
  email_change: 24 * 60 * 60 * 1000, // 24 hours
  admin_invite: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const createInvitation = async (
  data: CreateInvitationDto,
  client: PoolClient | Pool = db,
): Promise<{ invitation: Invitation; token: string }> => {
  const { email, type, organization_id, role, invited_by, new_email, user_id } = data;

  if (type === "org_invite" && (!organization_id || !role)) {
    throw httpError(400, "Organization invite requires organization_id and role");
  }

  if (type === "email_change" && (!new_email || !user_id)) {
    throw httpError(400, "Email change requires new_email and user_id");
  }

  const token = uuidv4();
  const tokenHash = determinateHash(token);

  const expiresAt = new Date(Date.now() + EXPIRY_TIMES[type]).toISOString();

  // Check if user already exists (for is_existing_user flag)
  const userCheckQuery = `SELECT user_id FROM users WHERE email = $1 AND deleted_at IS NULL`;
  const userCheckResult = await client.query(userCheckQuery, [
    email.toLowerCase(),
  ]);
  const isExistingUser = userCheckResult.rows.length > 0;

  const queryString = `
    INSERT INTO invitations
    (email, token_hash, type, organization_id, role, invited_by, is_existing_user, new_email, user_id, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;

  const values = [
    email.toLowerCase(),
    tokenHash,
    type,
    organization_id || null,
    role || null,
    invited_by || null,
    isExistingUser,
    new_email?.toLowerCase() || null,
    user_id || null,
    expiresAt,
  ];

  try {
    const result = await client.query(queryString, values);
    return {
      invitation: result.rows[0],
      token, // Return unhashed token for email
    };
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw httpError(500, "Failed to create invitation - please try again");
    }
    throw err;
  }
};

export const getInvitationByTokenHash = async (
  tokenHash: string,
  client: PoolClient | Pool = db,
): Promise<Invitation | null> => {
  const queryString = `
    SELECT * FROM invitations
    WHERE token_hash = $1
    FOR UPDATE;
  `;

  const result = await client.query(queryString, [tokenHash]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const getInvitationById = async (
  id: string,
  client: PoolClient | Pool = db,
): Promise<Invitation | null> => {
  const queryString = `
    SELECT * FROM invitations
    WHERE id = $1;
  `;

  const result = await client.query(queryString, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const markInvitationUsed = async (
  id: string,
  client: PoolClient | Pool = db,
): Promise<Invitation> => {
  const queryString = `
    UPDATE invitations
    SET used_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const result = await client.query(queryString, [id]);
  if (result.rows.length === 0) {
    throw httpError(404, "Invitation not found");
  }
  return result.rows[0];
};

export const invalidatePendingInvitations = async (
  email: string,
  type: InvitationType,
  client: PoolClient | Pool = db,
): Promise<number> => {
  const queryString = `
    UPDATE invitations
    SET used_at = NOW()
    WHERE email = $1 AND type = $2 AND used_at IS NULL
    RETURNING id;
  `;

  const result = await client.query(queryString, [email.toLowerCase(), type]);
  return result.rowCount || 0;
};

export const listInvitationsByOrganization = async (
  organizationId: string,
  pagination: PaginationOptions = {},
  client: PoolClient | Pool = db,
): Promise<Invitation[]> => {
  let queryString = `
    SELECT * FROM invitations
    WHERE organization_id = $1 AND used_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
  `;

  const values: any[] = [organizationId];
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

  const result = await client.query(queryString, values);
  return result.rows;
};

export const deleteInvitation = async (
  id: string,
  client: PoolClient | Pool = db,
): Promise<boolean> => {
  const queryString = `
    DELETE FROM invitations
    WHERE id = $1
    RETURNING id;
  `;

  const result = await client.query(queryString, [id]);
  return (result.rowCount || 0) > 0;
};

export const cleanupExpiredInvitations = async (
  client: PoolClient | Pool = db,
): Promise<number> => {
  const queryString = `
    DELETE FROM invitations
    WHERE expires_at < NOW()
    RETURNING id;
  `;

  const result = await client.query(queryString);
  return result.rowCount || 0;
};

export const validateInvitationToken = async (
  token: string,
  expectedType?: InvitationType,
  client: PoolClient | Pool = db,
): Promise<Invitation> => {
  const tokenHash = determinateHash(token);
  const invitation = await getInvitationByTokenHash(tokenHash, client);

  if (!invitation) {
    throw httpError(404, "Invalid or expired invitation");
  }

  if (invitation.used_at) {
    throw httpError(400, "Invitation has already been used");
  }

  if (new Date(invitation.expires_at) < new Date()) {
    throw httpError(400, "Invitation has expired");
  }

  if (expectedType && invitation.type !== expectedType) {
    throw httpError(400, "Invalid invitation type");
  }

  return invitation;
};

export const getPendingInvitationsForEmail = async (
  email: string,
  type?: InvitationType,
  client: PoolClient | Pool = db,
): Promise<Invitation[]> => {
  let queryString = `
    SELECT * FROM invitations
    WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()
  `;

  const values: any[] = [email.toLowerCase()];

  if (type) {
    queryString += ` AND type = $2`;
    values.push(type);
  }

  queryString += ` ORDER BY created_at DESC`;

  const result = await client.query(queryString, values);
  return result.rows;
};
