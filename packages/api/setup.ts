import { generateApiKey } from "./src/utils/generateApiKey";
import crypto from "crypto";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function setup() {
  const PROJECT_NAME = process.env.PROJECT_NAME || 'app';
  const DB_PASSWORD = process.env.DB_PASSWORD || 'Password1';

  console.log(`Setting up ${PROJECT_NAME}...\n`);

  const refreshKey = generateApiKey();
  const userAccessKey = generateApiKey();
  const adminAccessKey = generateApiKey();
  const mfaChallengeKey = generateApiKey();
  const mfaEncryptionKey = generateEncryptionKey();

  const envContent = `REFRESH_KEY="${refreshKey}"
USER_ACCESS_KEY="${userAccessKey}"
ADMIN_ACCESS_KEY="${adminAccessKey}"
MFA_CHALLENGE_KEY="${mfaChallengeKey}"
MFA_ENCRYPTION_KEY="${mfaEncryptionKey}"

# Registration modes
# ACCOUNT_CREATION_MODE: open | invite_only | admin_only (default: open)
# ORG_CREATION_MODE: open | self_registered_only | admin_only (default: open)
ACCOUNT_CREATION_MODE=open
ORG_CREATION_MODE=open

# Google OAuth (configure these with your Google Cloud credentials)
# GOOGLE_CLIENT_ID=""
# GOOGLE_CLIENT_SECRET=""
# GOOGLE_CALLBACK_URL="http://localhost:3000/api/auth/google/callback"
`;

  fs.writeFileSync(".env", envContent);
  console.log("Created .env with generated API keys");

  const envDevContent = `PGDATABASE=${PROJECT_NAME}_db
PGUSER=${PROJECT_NAME}_user
PGPASSWORD=${DB_PASSWORD}
`;
  fs.writeFileSync(".env.development", envDevContent);
  console.log("Created .env.development");

  const envTestContent = `PGDATABASE=test_${PROJECT_NAME}_db
PGUSER=${PROJECT_NAME}_user
PGPASSWORD=${DB_PASSWORD}
`;
  fs.writeFileSync(".env.test", envTestContent);
  console.log("Created .env.test");

  console.log("\nSetting up PostgreSQL...");
  const dbUser = `${PROJECT_NAME}_user`;
  const dbName = `${PROJECT_NAME}_db`;
  const testDbName = `test_${PROJECT_NAME}_db`;

  try {
    // Try to create user, or update password if already exists
    try {
      const createUserSQL = `CREATE USER ${dbUser} WITH PASSWORD '${DB_PASSWORD}' CREATEDB;`;
      await execAsync(`psql -d postgres -c "${createUserSQL}"`);
      console.log(`Created PostgreSQL user '${dbUser}'`);
    } catch (e) {
      const alterUserSQL = `ALTER USER ${dbUser} WITH PASSWORD '${DB_PASSWORD}';`;
      await execAsync(`psql -d postgres -c "${alterUserSQL}"`);
      console.log(`Updated password for PostgreSQL user '${dbUser}'`);
    }

    await execAsync(`psql -d postgres -c "DROP DATABASE IF EXISTS ${dbName};"`);
    await execAsync(`psql -d postgres -c "DROP DATABASE IF EXISTS ${testDbName};"`);
    await execAsync(`psql -d postgres -c "CREATE DATABASE ${dbName} OWNER ${dbUser};"`);
    await execAsync(`psql -d postgres -c "CREATE DATABASE ${testDbName} OWNER ${dbUser};"`);
    console.log(`Databases created: ${dbName}, ${testDbName}`);
  } catch (error) {
    console.log("\nCould not set up PostgreSQL automatically.");
    console.log("Make sure you've run the one-time setup:");
    console.log("  sudo -u postgres createuser -s $(whoami)");
    console.log("\nThen run this script again.");
    return;
  }

  console.log("\nSetup complete!");
  console.log("Your API keys have been generated in .env");
  console.log("\nNote: To enable Google OAuth, configure GOOGLE_CLIENT_ID,");
  console.log("GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL in your .env file.");
}

setup().catch(console.error);