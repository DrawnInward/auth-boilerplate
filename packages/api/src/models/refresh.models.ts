import jwt from "jsonwebtoken";
import db from "../database/db";
import * as dotenv from "dotenv";
import {
  CreateRefreshTokenDto,
  RefreshToken,
  UpdateRefreshTokenDto,
} from "../types";
import { determinateHash } from "../utils";
import { getRefreshTokenDays } from "../utils/config";
import { Pool, PoolClient } from "pg";
import { childLogger } from "../utils/logger";
import { httpError } from "../utils/httpError";
import { withTransaction } from "../utils/withTransaction";

const log = childLogger("refreshModels");
dotenv.config({ quiet: true });

export const fetchRefresh = async (): Promise<RefreshToken[]> => {
  const queryString = `
    SELECT * FROM refresh; 
  `;

  const refresh = await db.query(queryString);
  return refresh.rows;
};

export const fetchRefreshById = async (id: string): Promise<RefreshToken> => {
  const queryString = `
    SELECT * FROM refresh
    WHERE refresh_id = $1; 
  `;

  const refresh = await db.query(queryString, [id]);
  if (refresh.rows.length === 0) {
    throw httpError(404, "Refresh token not found");
  }

  return refresh.rows[0];
};

export const fetchRefreshByTokenHash = async (
  tokenHash: string,
  client: PoolClient | Pool = db,
): Promise<RefreshToken> => {
  const queryString = `
    SELECT * FROM refresh
    WHERE token_hash = $1
    FOR UPDATE; 
  `;

  const refresh = await client.query(queryString, [tokenHash]);
  if (refresh.rows.length === 0)
    throw httpError(404, "Refresh token not found");

  return refresh.rows[0];
};

export const modifyRefreshById = async (
  detailsToUpdate: UpdateRefreshTokenDto,
  id: string,
  client: PoolClient | Pool = db,
): Promise<RefreshToken> => {
  const setClause = Object.keys(detailsToUpdate)
    .map((key, index) => `${key} = $${index + 1}`)
    .join(", ");
  const values = Object.values(detailsToUpdate);

  const queryString = `
    UPDATE refresh
    SET ${setClause}
    WHERE refresh_id = $${values.length + 1} 
    RETURNING *;
  `;

  const updatedRefresh = await client.query(queryString, [...values, id]);
  return updatedRefresh.rows[0];
};

export const addRefresh = async (
  newRefresh: CreateRefreshTokenDto,
  client: PoolClient | Pool = db,
): Promise<{ token: string; refresh_id: string }> => {
  const queryString = `
    INSERT INTO refresh
    (role_id, role_type, token_hash, expiration_time, issued_time, last_used_time, is_active, used_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;

  const { role_id, role_type } = newRefresh;
  const issued_time = new Date();
  const expiration_time = new Date(issued_time);
  expiration_time.setDate(issued_time.getDate() + getRefreshTokenDays());
  const formattedExpiration_time = expiration_time.toISOString();
  const formattedIssued_time = issued_time.toISOString();

  const initialAddRefreshTokenQuery = await client.query(queryString, [
    role_id,
    role_type,
    "placeholder_hash",
    formattedExpiration_time,
    formattedIssued_time,
    null,
    true,
    null,
  ]);

  const refreshId = initialAddRefreshTokenQuery.rows[0].refresh_id;
  const refreshKey = process.env.REFRESH_KEY;
  if (!refreshKey) {
    throw httpError(500, "Missing REFRESH_KEY environment variable");
  }

  const refreshToken = jwt.sign(
    { refresh_id: refreshId, role_id, role_type },
    refreshKey,
    { expiresIn: `${getRefreshTokenDays()}d` },
  );

  const tokenHash = determinateHash(refreshToken);

  const updateRefreshTokenQuery = await client.query(
    `
    UPDATE refresh
    SET token_hash = $1
    WHERE refresh_id = $2 
    RETURNING *;
    `,
    [tokenHash, refreshId],
  );

  const refreshTokenDetails = updateRefreshTokenQuery.rows[0];

  return { token: refreshToken, refresh_id: refreshTokenDetails.refresh_id };
};

export const removeRefreshById = async (id: string): Promise<void> => {
  const queryString = `
    DELETE FROM refresh
    WHERE refresh_id = $1
    RETURNING refresh_id;
  `;

  const result = await db.query(queryString, [id]);

  if (result.rows.length === 0) {
    throw httpError(404, "Refresh token not found");
  }
};

export const createAccessToken = async (
  decodedRefreshToken: { refresh_id: string; role_type: string },
  originalRefreshToken: string,
): Promise<{ accessToken: string; newRefreshToken: string }> => {
  const { refresh_id, role_type } = decodedRefreshToken;
  const tokenHash = determinateHash(originalRefreshToken);

  return withTransaction(db, async (client) => {
    const refreshTokenData = await fetchRefreshByTokenHash(tokenHash, client);

    if (refreshTokenData.used_at) {
      // Token was already used - possible replay attack
      await revokeUserTokens(
        refreshTokenData.role_id,
        refreshTokenData.role_type,
      );
      throw httpError(
        401,
        "Refresh token has already been used - possible security breach",
      );
    }

    if (!refreshTokenData.is_active) {
      throw httpError(401, "Refresh token has been revoked");
    }

    const expirationTime = new Date(refreshTokenData.expiration_time!);
    if (expirationTime < new Date()) {
      throw httpError(401, "Refresh token has expired");
    }

    await modifyRefreshById(
      {
        used_at: new Date().toISOString(),
        is_active: false,
        last_used_time: new Date().toISOString(),
      },
      refresh_id,
      client,
    );

    const newRefreshData = await addRefresh(
      {
        role_id: refreshTokenData.role_id,
        role_type: refreshTokenData.role_type,
      },
      client,
    );

    const accessKeyEnvironmentVariable = `${role_type.toUpperCase()}_ACCESS_KEY`;
    const accessKey = process.env[accessKeyEnvironmentVariable];

    if (!accessKey) {
      throw httpError(
        500,
        `Missing environment variable: ${accessKeyEnvironmentVariable}`,
      );
    }
    const accessToken = jwt.sign(
      { role_id: refreshTokenData.role_id, role_type },
      accessKey,
      { expiresIn: "10m" },
    );

    return {
      accessToken,
      newRefreshToken: newRefreshData.token,
    };
  });
};

export const revokeUserTokens = async (
  roleId: string,
  roleType: string,
  client: PoolClient | Pool = db,
): Promise<string> => {
  const queryStr = `
    UPDATE refresh
    SET is_active = FALSE
    WHERE role_id = $1 AND role_type =$2 AND is_active = TRUE
    RETURNING *;
  `;

  try {
    const result = await client.query(queryStr, [roleId, roleType]);
    return `${result.rowCount} tokens revoked successfully`;
  } catch (error) {
    log.error({ err: error }, "Error revoking user tokens");
    throw error;
  }
};

export const revokeRefreshToken = async (
  refreshId: string,
  client = db,
): Promise<string> => {
  const queryStr = `
    UPDATE refresh
    SET is_active = FALSE
    WHERE refresh_id = $1 AND is_active = TRUE
    RETURNING *;
  `;

  try {
    const result = await client.query(queryStr, [refreshId]);
    if (result.rowCount === 0) {
      return "No active token found to revoke";
    }
    return "Token revoked successfully";
  } catch (error) {
    log.error({ err: error }, "Error revoking refresh token");
    throw error;
  }
};
