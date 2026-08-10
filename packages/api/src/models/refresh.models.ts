import jwt from "jsonwebtoken";
import db from "../database/db";
import * as dotenv from "dotenv";
import {
  CreateRefreshTokenDto,
  RefreshToken,
  UpdateRefreshTokenDto,
} from "../types";
import { determinateHash, isAccountActive } from "../utils";
import {
  getAccessTokenLifetimeSeconds,
  getRefreshTokenDays,
  getRefreshReuseGraceMs,
} from "../utils/config";
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
  // The JWT-decoded payload is not trusted for identity — role and owner are
  // read from the locked DB row below. Verifying the signature is the caller's
  // job (the refresh endpoint); this only ever sees a token that passed it.
  _decodedRefreshToken: { refresh_id: string; role_type: string },
  originalRefreshToken: string,
): Promise<{ accessToken: string; newRefreshToken: string }> => {
  const tokenHash = determinateHash(originalRefreshToken);

  const outcome = await withTransaction(
    db,
    async (
      client,
    ): Promise<
      | { breach: { role_id: string; role_type: string } }
      | { inactivePrincipal: { refresh_id: string } }
      | { tokens: { accessToken: string; newRefreshToken: string } }
    > => {
      const presented = await fetchRefreshByTokenHash(tokenHash, client);

      // Both time comparisons below run on the database clock, against
      // timestamps the database wrote. Comparing a DB-written used_at against
      // this process's Date.now() breaks the moment two app clocks disagree
      // (second instance, VM resume, NTP step): skew ahead turns every grace
      // race into a mass-revoking "replay", skew behind holds the grace window
      // open forever.
      const clock = await client.query(
        `SELECT expiration_time < NOW() AS is_expired,
                EXTRACT(EPOCH FROM (NOW() - used_at)) AS used_ago_seconds
         FROM refresh
         WHERE refresh_id = $1`,
        [presented.refresh_id],
      );
      const { is_expired, used_ago_seconds } = clock.rows[0];

      if (presented.used_at) {
        // The presented token has already been rotated. Two very different
        // things look identical here — a concurrent/retried exchange from a
        // legitimate client (an SPA firing several requests at once after the
        // access token expired), and a replay of a stale, stolen token. The
        // reuse-interval (leeway) plus the recorded successor tell them apart:
        // honour the reuse only while it is inside the window AND the successor
        // token is still alive. A rotated-then-revoked lineage (logout, admin
        // revoke, an earlier breach) has a dead successor and must never be
        // resurrected within grace. (Reuse-interval per the OAuth 2.0 Security
        // BCP; see hardening-plan A1.)
        const withinGrace =
          Number(used_ago_seconds) * 1000 <= getRefreshReuseGraceMs();

        if (!withinGrace) {
          // A genuine replay of a stale token — breach. The revocation itself
          // runs AFTER this transaction has released its connection (see the
          // outcome handling below): awaiting a second pool connection while
          // holding one here meant ~pool-size concurrent replays could wedge
          // the whole pool in a circular wait. Checked before expiry so an
          // expired replay still trips breach detection.
          return {
            breach: {
              role_id: presented.role_id,
              role_type: presented.role_type,
            },
          };
        }

        // Grace never extends a token past its own lifetime: a parent that
        // expired since rotation must not buy a fresh full-lifetime lineage.
        if (is_expired) {
          throw httpError(401, "Refresh token has expired");
        }

        // Liveness proxy for the lineage: is the immediate successor still
        // active? We deliberately check only the FIRST successor, not the
        // whole chain. Relaxing this to "successor was rotated" (used_at set)
        // would reopen the logout hole, because revokeUserTokens sets
        // is_active=false WITHOUT clearing used_at — a rotated-then-logged-out
        // successor would read as live. The cost of the conservative check: if
        // the successor is itself rotated inside this same grace window, a
        // late in-flight sibling holding the parent gets a spurious retriable
        // 401 (session survives). Very hard to hit — after rotating, a client
        // has a fresh access token and won't rotate again within the ~30s
        // window — and Phase C single-flight removes the triggering
        // multi-request race. A full lineage walk is the robust fix, deferred
        // to the authService extraction. (hardening-plan A1)
        //
        // FOR UPDATE, not a plain read: it serialises a concurrent revocation
        // (logout, breach, admin) behind this exchange, and pairs with
        // revokeUserTokens' revoke-until-clean loop — a revocation that was
        // blocked on this lock while we minted a successor catches that
        // successor on its next pass. Without the pair, a within-grace refresh
        // racing a logout could mint a token the logout never sees.
        const successorActive = presented.replaced_by
          ? (
              await client.query(
                "SELECT is_active FROM refresh WHERE refresh_id = $1 FOR UPDATE",
                [presented.replaced_by],
              )
            ).rows[0]?.is_active === true
          : false;

        if (!successorActive) {
          // Inside the window but the session was ended — reject without
          // resurrecting it, and without punishing (it is already revoked).
          throw httpError(401, "Refresh token has been revoked");
        }
        // Otherwise this is a live race: fall through and mint a fresh
        // successor for this caller, leaving the already-retired parent
        // untouched.
      } else {
        if (!presented.is_active) {
          throw httpError(401, "Refresh token has been revoked");
        }

        if (is_expired) {
          throw httpError(401, "Refresh token has expired");
        }
      }

      // A refresh token is only as valid as the account behind it: a
      // deactivated or soft-deleted principal must not mint fresh access
      // tokens off an old refresh. Deactivation/deletion revokes tokens at its
      // own site (see the admin handlers); this is the defensive gate for any
      // path that deactivates without revoking. Loaded through the transaction
      // client — a pool read here would hold this connection while queueing
      // for a second one, and enough concurrent rotations would wedge the
      // whole pool. (S4)
      const principal =
        presented.role_type === "admin"
          ? await getAdminById(presented.role_id, client)
          : await getUserById(presented.role_id, client);
      if (!isAccountActive(principal)) {
        // Refusing alone would leave the presented token live and dormant —
        // working again the moment the account is reactivated. Burn it on the
        // way out (in the outcome handling below, outside this transaction,
        // so the 401 can't roll the write back). Unpresented tokens of the
        // lineage remain the revoke-at-source's job, not this gate's.
        return { inactivePrincipal: { refresh_id: presented.refresh_id! } };
      }

      const newRefreshData = await addRefresh(
        {
          role_id: presented.role_id,
          role_type: presented.role_type,
        },
        client,
      );

      // First rotation only: retire the presented token and record its
      // successor, so a concurrent retry within the window can recognise a
      // live race. A within-grace reuse skips this — the parent is already
      // retired and already points at its first successor. used_at is written
      // by the database clock because the grace arithmetic above reads it
      // against NOW().
      if (!presented.used_at) {
        await client.query(
          `UPDATE refresh
           SET used_at = NOW(), is_active = FALSE, last_used_time = NOW(),
               replaced_by = $2
           WHERE refresh_id = $1`,
          [presented.refresh_id, newRefreshData.refresh_id],
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
        { expiresIn: getAccessTokenLifetimeSeconds() },
      );

      return {
        tokens: {
          accessToken,
          newRefreshToken: newRefreshData.token,
        },
      };
    },
  );

  if ("inactivePrincipal" in outcome) {
    const { refresh_id } = outcome.inactivePrincipal;
    try {
      await revokeRefreshToken(refresh_id);
    } catch (err) {
      // Deliberate log — the middleware only sees the 401 below, and a
      // dormant token we failed to burn is worth an operator's attention.
      log.error(
        { err, refresh_id },
        "Inactive-account refresh refused but token revocation FAILED",
      );
    }
    throw httpError(401, "Account is no longer active");
  }

  if ("breach" in outcome) {
    const { role_id, role_type } = outcome.breach;
    try {
      await revokeUserTokens(role_id, role_type);
      log.warn(
        { role_id, role_type },
        "Refresh token replay detected — all sessions revoked",
      );
    } catch (err) {
      // Deliberate log, not a double-log: the middleware never sees this
      // error (the breach 401 below replaces it), and a replay whose
      // revocation failed is exactly the event an operator must not lose.
      log.error(
        { err, role_id, role_type },
        "Refresh token replay detected but session revocation FAILED",
      );
    }
    throw httpError(
      401,
      "Refresh token has already been used - possible security breach",
    );
  }

  return outcome.tokens;
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
    RETURNING refresh_id;
  `;

  // Revoke until a pass finds nothing: a single UPDATE's snapshot cannot see a
  // token committed after the statement began — in particular one minted by a
  // within-grace exchange that this revocation was blocked behind (see the
  // successor FOR UPDATE in createAccessToken). Each pass kills everything it
  // can see, and honoured exchanges need an active successor the previous pass
  // just killed, so the loop terminates almost immediately.
  let revoked = 0;
  for (;;) {
    const result = await client.query(queryStr, [roleId, roleType]);
    if (!result.rowCount) break;
    revoked += result.rowCount;
  }
  return `${revoked} tokens revoked successfully`;
};

export const revokeRefreshToken = async (
  refreshId: string,
  client = db,
): Promise<string> => {
  const queryStr = `
    UPDATE refresh
    SET is_active = FALSE
    WHERE refresh_id = $1 AND is_active = TRUE
    RETURNING refresh_id;
  `;

  const result = await client.query(queryStr, [refreshId]);
  if (result.rowCount === 0) {
    return "No active token found to revoke";
  }
  return "Token revoked successfully";
};
