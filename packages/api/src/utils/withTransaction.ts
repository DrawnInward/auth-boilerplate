import { Pool, PoolClient } from "pg";

// The one transaction wrapper: BEGIN/COMMIT/ROLLBACK/release live here exactly
// once, so no call site can forget the release or the rollback. The callback's
// return value is returned after COMMIT; any throw rolls back and rethrows.
export const withTransaction = async <T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // Safe even when COMMIT itself failed — ROLLBACK on a dead transaction is a
    // no-op warning, never a throw that would mask `error`.
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};
