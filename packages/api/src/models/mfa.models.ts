import db from "../database/db";
import { Pool, PoolClient } from "pg";
import { encrypt, decrypt } from "../utils/encryption";
import { httpError } from "../utils/httpError";

export type RoleType = "user" | "admin";

interface MfaStatus {
  mfa_enabled: boolean;
  mfa_secret: string | null;
}

function getTableName(roleType: RoleType): string {
  return roleType === "user" ? "users" : "admins";
}

function getIdColumn(roleType: RoleType): string {
  return roleType === "user" ? "user_id" : "admin_id";
}

export async function getMfaStatus(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<MfaStatus | null> {
  const table = getTableName(roleType);
  const idColumn = getIdColumn(roleType);

  const result = await client.query(
    `SELECT mfa_enabled, mfa_secret FROM ${table} WHERE ${idColumn} = $1 AND deleted_at IS NULL`,
    [roleId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

export async function getMfaSecret(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<string | null> {
  const status = await getMfaStatus(roleId, roleType, client);
  if (!status || !status.mfa_secret) {
    return null;
  }
  return decrypt(status.mfa_secret);
}

export async function setMfaSecret(
  roleId: string,
  roleType: RoleType,
  secret: string,
  client: PoolClient | Pool = db
): Promise<void> {
  const table = getTableName(roleType);
  const idColumn = getIdColumn(roleType);
  const encryptedSecret = encrypt(secret);

  const result = await client.query(
    `UPDATE ${table} SET mfa_secret = $1, updated_at = NOW() WHERE ${idColumn} = $2 AND deleted_at IS NULL RETURNING ${idColumn}`,
    [encryptedSecret, roleId]
  );

  if (result.rows.length === 0) {
    throw httpError(404, `${roleType === "user" ? "User" : "Admin"} not found`);
  }
}

export async function enableMfa(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<void> {
  const table = getTableName(roleType);
  const idColumn = getIdColumn(roleType);

  const result = await client.query(
    `UPDATE ${table} SET mfa_enabled = true, updated_at = NOW() WHERE ${idColumn} = $1 AND deleted_at IS NULL RETURNING ${idColumn}`,
    [roleId]
  );

  if (result.rows.length === 0) {
    throw httpError(404, `${roleType === "user" ? "User" : "Admin"} not found`);
  }
}

export async function disableMfa(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<void> {
  const table = getTableName(roleType);
  const idColumn = getIdColumn(roleType);

  const result = await client.query(
    `UPDATE ${table} SET mfa_enabled = false, mfa_secret = NULL, updated_at = NOW() WHERE ${idColumn} = $1 AND deleted_at IS NULL RETURNING ${idColumn}`,
    [roleId]
  );

  if (result.rows.length === 0) {
    throw httpError(404, `${roleType === "user" ? "User" : "Admin"} not found`);
  }
}

export async function clearMfaSecret(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<void> {
  const table = getTableName(roleType);
  const idColumn = getIdColumn(roleType);

  await client.query(
    `UPDATE ${table} SET mfa_secret = NULL, updated_at = NOW() WHERE ${idColumn} = $1 AND deleted_at IS NULL`,
    [roleId]
  );
}

// Backup codes functions

export interface BackupCode {
  id: string;
  role_id: string;
  role_type: RoleType;
  code_hash: string;
  used_at: string | null;
  created_at: string;
}

export async function createBackupCodes(
  roleId: string,
  roleType: RoleType,
  hashedCodes: string[],
  client: PoolClient | Pool = db
): Promise<void> {
  for (const codeHash of hashedCodes) {
    await client.query(
      `INSERT INTO mfa_backup_codes (role_id, role_type, code_hash) VALUES ($1, $2, $3)`,
      [roleId, roleType, codeHash]
    );
  }
}

export async function getUnusedBackupCodes(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<BackupCode[]> {
  const result = await client.query(
    `SELECT * FROM mfa_backup_codes WHERE role_id = $1 AND role_type = $2 AND used_at IS NULL ORDER BY created_at`,
    [roleId, roleType]
  );
  return result.rows;
}

export async function getBackupCodeCount(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<number> {
  const result = await client.query(
    `SELECT COUNT(*) as count FROM mfa_backup_codes WHERE role_id = $1 AND role_type = $2 AND used_at IS NULL`,
    [roleId, roleType]
  );
  return parseInt(result.rows[0].count);
}

export async function markBackupCodeUsed(
  codeId: string,
  client: PoolClient | Pool = db
): Promise<void> {
  await client.query(
    `UPDATE mfa_backup_codes SET used_at = NOW() WHERE id = $1`,
    [codeId]
  );
}

export async function deleteAllBackupCodes(
  roleId: string,
  roleType: RoleType,
  client: PoolClient | Pool = db
): Promise<void> {
  await client.query(
    `DELETE FROM mfa_backup_codes WHERE role_id = $1 AND role_type = $2`,
    [roleId, roleType]
  );
}
