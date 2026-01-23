import { generateApiKey } from "./src/utils/generateApiKey";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function setup() {
  const PROJECT_NAME = process.env.PROJECT_NAME || 'app';
  const DB_PASSWORD = process.env.DB_PASSWORD || 'Password1';

  console.log(`Setting up ${PROJECT_NAME}...\n`);

  const refreshKey = generateApiKey();
  const userAccessKey = generateApiKey();
  const adminAccessKey = generateApiKey();

  const envContent = `REFRESH_KEY="${refreshKey}"
USER_ACCESS_KEY="${userAccessKey}"
ADMIN_ACCESS_KEY="${adminAccessKey}"
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
}

setup().catch(console.error);