import db from "../database/db";
import { Pool, PoolClient } from "pg";
import { v4 as uuidv4 } from "uuid";
import { Invitation, InvitationType } from "@auth-boilerplate/shared";
import { CreateInvitationDto } from "../types";
import { determinateHash } from "../utils";
import { getOrganizationById } from "./organization.models";
import { PaginationOptions } from "../types/PaginationOptions";
import { isUniqueViolation } from "../utils/pgErrors";
import { httpError } from "../utils/httpError";
import { pagedQuery } from "../utils/pagedQuery";

const EXPIRY_TIMES: Record<InvitationType, number> = {
  registration: 24 * 60 * 60 * 1000, // 24 hours
  org_invite: 7 * 24 * 60 * 60 * 1000, // 7 days
  password_reset: 60 * 60 * 1000, // 1 hour
  email_change: 24 * 60 * 60 * 1000, // 24 hours
  admin_invite: 7 * 24 * 60 * 60 * 1000, // 7 days
  admin_registration: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const createInvitation = async (
  data: CreateInvitationDto,
  client: PoolClient | Pool = db,
): Promise<{ invitation: Invitation; token: string }> => {
  const { email, type, organization_id, role, invited_by, new_email, user_id } =
    data;

  if (type === "org_invite" && (!organization_id || !role)) {
    throw httpError(
      400,
      "Organization invite requires organization_id and role",
    );
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

// FOR UPDATE: every redemption is a validate-then-mark, so concurrent redeems
// of one token must serialise on this row — the loser blocks, then re-reads
// the committed used_at and fails validation. That only works when the caller
// passes its transaction client; on the pool the lock dies with the statement,
// which is fine for read-only callers but never for a redemption.
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

// Compare-and-set: consumes the invitation only if it is still unused, so of
// two concurrent redemptions exactly one commits. Under the lock discipline
// above the loser fails validation first — this predicate is the backstop that
// keeps a future duplicate-tolerant downstream write (membership, account)
// from silently turning the race into a double-commit.
export const markInvitationUsed = async (
  id: string,
  client: PoolClient | Pool = db,
): Promise<Invitation> => {
  const queryString = `
    UPDATE invitations
    SET used_at = NOW()
    WHERE id = $1 AND used_at IS NULL
    RETURNING *;
  `;

  const result = await client.query(queryString, [id]);
  if (result.rows.length === 0) {
    const existing = await getInvitationById(id, client);
    if (existing) {
      throw httpError(400, "Invitation has already been used");
    }
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
  const { text, values } = pagedQuery({
    select: "SELECT * FROM invitations",
    where: ["used_at IS NULL", "expires_at > NOW()"],
    equals: { organization_id: organizationId },
    orderBy: "created_at DESC",
    pagination,
  });

  const result = await client.query(text, values);
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

  // The invitation row outlives a soft-deleted organization, so an org-bound
  // token must read exactly like one that never existed — this validator owns
  // that invariant so every redeemer (and verifyToken) answers alike. (D2)
  if (invitation.organization_id) {
    const organization = await getOrganizationById(
      invitation.organization_id,
      client,
    );
    if (!organization) {
      throw httpError(404, "Invalid or expired invitation");
    }
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
