import db from "../database/db";
import { Pool, PoolClient } from "pg";
import { MfaChallenge, CreateMfaChallengeDto } from "../types";

// expires_at is computed on the DB clock — every read of it below also runs
// on the DB clock, so expiry never depends on app/DB clock agreement.
export async function createMfaChallenge(
  challenge: CreateMfaChallengeDto,
  client: PoolClient | Pool = db,
): Promise<MfaChallenge> {
  const result = await client.query(
    `INSERT INTO mfa_challenges (jti, role_id, role_type, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))
     RETURNING *`,
    [
      challenge.jti,
      challenge.role_id,
      challenge.role_type,
      challenge.ttl_seconds,
    ],
  );
  return result.rows[0];
}

export async function getMfaChallengeByJti(
  jti: string,
  client: PoolClient | Pool = db,
): Promise<(MfaChallenge & { is_expired: boolean }) | null> {
  const result = await client.query(
    `SELECT *, expires_at <= NOW() AS is_expired
     FROM mfa_challenges WHERE jti = $1`,
    [jti],
  );
  return result.rows[0] ?? null;
}

// Compare-and-set: consumes the challenge only if it is still live, so of two
// concurrent verifies exactly one wins. Returns null when the challenge was
// already consumed, has expired, or has exhausted its attempts — row-level
// expiry is enforced here, not only by the opportunistic GC.
export async function consumeMfaChallenge(
  jti: string,
  maxAttempts: number,
  client: PoolClient | Pool = db,
): Promise<MfaChallenge | null> {
  const result = await client.query(
    `UPDATE mfa_challenges
     SET consumed_at = NOW()
     WHERE jti = $1 AND consumed_at IS NULL AND failed_attempts < $2
       AND expires_at > NOW()
     RETURNING *`,
    [jti, maxAttempts],
  );
  return result.rows[0] ?? null;
}

// The cap predicate lives in the UPDATE itself: an unconditional increment
// would let K concurrent wrong guesses all land after passing the guard's
// plain SELECT (check-then-act), growing the budget without bound.
export async function incrementMfaChallengeAttempts(
  jti: string,
  maxAttempts: number,
  client: PoolClient | Pool = db,
): Promise<number | null> {
  const result = await client.query(
    `UPDATE mfa_challenges
     SET failed_attempts = failed_attempts + 1
     WHERE jti = $1 AND consumed_at IS NULL AND failed_attempts < $2
     RETURNING failed_attempts`,
    [jti, maxAttempts],
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
