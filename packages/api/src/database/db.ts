import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

const ENV = process.env.NODE_ENV || "development";

dotenv.config({
  quiet: true,
  path: path.resolve(__dirname, `../../.env.${ENV}`),
});

if (!process.env.PGDATABASE && !process.env.DATABASE_URL) {
  throw new Error("PGDATABASE or DATABASE_URL must be set in the environment.");
}

const config = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  // pg's default is 0 = wait forever, which turns any accidental
  // acquire-while-holding burst into a permanent API-wide outage needing a
  // restart. With a bound, the worst case degrades to some 500s under a
  // burst and the pool self-heals.
  connectionTimeoutMillis: 10_000,
};

const pool = new Pool(config);

export default pool;
