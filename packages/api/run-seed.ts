import bcrypt from "bcrypt";
import seed from "./src/database/seed";
import { DEV_UUIDS } from "./src/database/dev-data";
import * as devData from "./src/database/dev-data";

async function runSeed() {
  try {
    console.log("Starting database seed with dev data...\n");

    await seed({
      usersData: devData.devUsers,
      adminsData: devData.devAdmins,
      organizationsData: devData.devOrganizations,
      organizationMembersData: devData.devOrganizationMembers,
      verbose: true,
    });

    console.log("\n✓ Database seeded successfully!");
    console.log("\nDev Credentials:");
    console.log("  User: demo@example.com / Password123!");
    console.log("  Admin: admin@example.com / AdminPassword123!");
    process.exit(0);
  } catch (error) {
    console.error("\n✗ Seed failed:", error);
    process.exit(1);
  }
}

runSeed();
