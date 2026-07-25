import * as fs from "fs";
import * as path from "path";
import { Pool, PoolClient } from "pg";
import db from "./db";

// Compiled output lives in dist/ but .sql files stay in src/ (tsc does not copy
// them); the build script copies migrations/ into dist alongside this file.
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const ensureMigrationsTable = async (client: PoolClient | Pool) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      filename VARCHAR(255) UNIQUE NOT NULL,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

export const listMigrationFiles = (dir: string = MIGRATIONS_DIR): string[] =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

// Each file runs in its own transaction and is recorded only on success, so a
// failed migration leaves no partial schema and no phantom row — rerunning
// resumes at the file that failed.
export const runMigrations = async (
  pool: Pool = db,
  opts: { dir?: string; log?: (msg: string) => void } = {},
): Promise<MigrationResult> => {
  const dir = opts.dir ?? MIGRATIONS_DIR;
  const log = opts.log ?? (() => {});

  const client = await pool.connect();
  const result: MigrationResult = { applied: [], skipped: [] };

  try {
    await ensureMigrationsTable(client);

    const alreadyRun = new Set(
      (await client.query("SELECT filename FROM migrations")).rows.map(
        (r) => r.filename,
      ),
    );

    for (const filename of listMigrationFiles(dir)) {
      if (alreadyRun.has(filename)) {
        result.skipped.push(filename);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, filename), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO migrations (filename) VALUES ($1)", [
          filename,
        ]);
        await client.query("COMMIT");
        result.applied.push(filename);
        log(`applied ${filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${filename} failed and was rolled back: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return result;
  } finally {
    client.release();
  }
};
