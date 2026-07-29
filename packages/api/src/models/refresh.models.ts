import jwt from "jsonwebtoken";
import db from "../database/db";
import * as dotenv from "dotenv";
import {
  CreateRefreshTokenDto,
  RefreshToken,
  UpdateRefreshTokenDto,
} from "../types";
import { determinateHash } from "../utils";
import { getRefreshTokenDays, getRefreshReuseGraceMs } from "../utils/config";
import { getUserById } from "./users.models";
import { getAdminById } from "./admins.models";
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
  // The JWT-decoded payload is no longer trusted for identity — role and owner
  // are read from the locked DB row below — but the parameter is kept so the
  // caller contract (authoriseUser) is unchanged.
  _decodedRefreshToken: { refresh_id: string; role_type: string },
  originalRefreshToken: string,
): Promise<{ accessToken: string; newRefreshToken: string }> => {
  const tokenHash = determinateHash(originalRefreshToken);

  return withTransaction(db, async (client) => {
    const presented = await fetchRefreshByTokenHash(tokenHash, client);

    if (presented.used_at) {
      // The presented token has already been rotated. Two very different things
      // look identical here — a concurrent/retried exchange from a legitimate
      // client (an SPA firing several requests at once after the access token
      // expired), and a replay of a stale, stolen token. The reuse-interval
      // (leeway) plus the recorded successor tell them apart: honour the reuse
      // only while it is inside the window AND the successor token is still
      // alive. A rotated-then-revoked lineage (logout, admin revoke, an earlier
      // breach) has a dead successor and must never be resurrected within grace.
      // (Reuse-interval per the OAuth 2.0 Security BCP; see hardening-plan A1.)
      const usedAgoMs = Date.now() - new Date(presented.used_at).getTime();
      const withinGrace = usedAgoMs <= getRefreshReuseGraceMs();

      // Liveness proxy for the lineage: is the immediate successor still active?
      // We deliberately check only the FIRST successor, not the whole chain.
      // Relaxing this to "successor was rotated" (used_at set) would reopen the
      // logout hole, because revokeUserTokens sets is_active=false WITHOUT
      // clearing used_at — a rotated-then-logged-out successor would read as
      // live. The cost of the conservative check: if the successor is itself
      // rotated inside this same grace window, a late in-flight sibling holding
      // the parent gets a spurious retriable 401 (session survives). Very hard to
      // hit — after rotating, a client has a fresh 10-min access token and won't
      // rotate again within the ~30s window — and Phase C single-flight removes
      // the triggering multi-request race. A full lineage walk is the robust fix,
      // deferred to the authService extraction. (hardening-plan A1)
      const successorActive = presented.replaced_by
        ? (
            await client.query(
              "SELECT is_active FROM refresh WHERE refresh_id = $1",
              [presented.replaced_by],
            )
          ).rows[0]?.is_active === true
        : false;

      if (!withinGrace) {
        // A genuine replay of a stale token — trip breach detection. This runs
        // on the pool, not `client`, so it commits even though the throw below
        // rolls this transaction back; the replayed row is already
        // is_active=false so it is not among the rows the FOR UPDATE locks — no
        // self-deadlock.
        await revokeUserTokens(presented.role_id, presented.role_type);
        throw httpError(
          401,
          "Refresh token has already been used - possible security breach",
        );
      }

      if (!successorActive) {
        // Inside the window but the session was ended — reject without
        // resurrecting it, and without punishing (it is already revoked).
        throw httpError(401, "Refresh token has been revoked");
      }
      // Otherwise this is a live race: fall through and mint a fresh successor
      // for this caller, leaving the already-retired parent untouched.
    } else {
      if (!presented.is_active) {
        throw httpError(401, "Refresh token has been revoked");
      }

      const expirationTime = new Date(presented.expiration_time!);
      if (expirationTime < new Date()) {
        throw httpError(401, "Refresh token has expired");
      }
    }

    // A refresh token is only as valid as the account behind it: a deactivated
    // or soft-deleted principal must not mint fresh access tokens off an old
    // refresh. Deactivation/deletion revokes tokens at its own site (see the
    // admin handlers); this is the defensive gate that also covers any path that
    // deactivates without revoking, and it stops a reactivated account inheriting
    // old sessions. Read-only, so no lock conflict with the FOR UPDATE above. (S4)
    const principal =
      presented.role_type === "admin"
        ? await getAdminById(presented.role_id)
        : await getUserById(presented.role_id);
    if (!principal || principal.is_active === false) {
      throw httpError(401, "Account is no longer active");
    }

    const newRefreshData = await addRefresh(
      {
        role_id: presented.role_id,
        role_type: presented.role_type,
      },
      client,
    );

    // First rotation only: retire the presented token and record its successor,
    // so a concurrent retry within the window can recognise a live race. A
    // within-grace reuse skips this — the parent is already retired and already
    // points at its first successor.
    if (!presented.used_at) {
      await modifyRefreshById(
        {
          used_at: new Date().toISOString(),
          is_active: false,
          last_used_time: new Date().toISOString(),
          replaced_by: newRefreshData.refresh_id,
        },
        presented.refresh_id!,
        client,
      );
    }

    const role_type = presented.role_type;
    const accessKeyEnvironmentVariable = `${role_type.toUpperCase()}_ACCESS_KEY`;
    const accessKey = process.env[accessKeyEnvironmentVariable];

    if (!accessKey) {
      throw httpError(
        500,
        `Missing environment variable: ${accessKeyEnvironmentVariable}`,
      );
    }
    const accessToken = jwt.sign(
      { role_id: presented.role_id, role_type },
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
