import db from "../database/db";
import { Pool, PoolClient } from "pg";
import { MfaChallenge, CreateMfaChallengeDto } from "../types";

export async function createMfaChallenge(
  challenge: CreateMfaChallengeDto,
  client: PoolClient | Pool = db,
): Promise<MfaChallenge> {
  const result = await client.query(
    `INSERT INTO mfa_challenges (jti, role_id, role_type, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      challenge.jti,
      challenge.role_id,
      challenge.role_type,
      challenge.expires_at,
    ],
  );
  return result.rows[0];
}

export async function getMfaChallengeByJti(
  jti: string,
  client: PoolClient | Pool = db,
): Promise<MfaChallenge | null> {
  const result = await client.query(
    `SELECT * FROM mfa_challenges WHERE jti = $1`,
    [jti],
  );
  return result.rows[0] ?? null;
}

// Compare-and-set: consumes the challenge only if it is still live, so of two
// concurrent verifies exactly one wins. Returns null when the challenge was
// already consumed or has exhausted its attempts.
export async function consumeMfaChallenge(
  jti: string,
  maxAttempts: number,
  client: PoolClient | Pool = db,
): Promise<MfaChallenge | null> {
  const result = await client.query(
    `UPDATE mfa_challenges
     SET consumed_at = NOW()
     WHERE jti = $1 AND consumed_at IS NULL AND failed_attempts < $2
     RETURNING *`,
    [jti, maxAttempts],
  );
  return result.rows[0] ?? null;
}

export async function incrementMfaChallengeAttempts(
  jti: string,
  client: PoolClient | Pool = db,
): Promise<number | null> {
  const result = await client.query(
    `UPDATE mfa_challenges
     SET failed_attempts = failed_attempts + 1
     WHERE jti = $1
     RETURNING failed_attempts`,
    [jti],
  );
  return result.rows[0]?.failed_attempts ?? null;
}

export async function deleteExpiredMfaChallenges(
  client: PoolClient | Pool = db,
): Promise<number> {
  const result = await client.query(
    `DELETE FROM mfa_challenges WHERE expires_at < NOW()`,
  );
  return result.rowCount ?? 0;
}
