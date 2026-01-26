import bcrypt from "bcrypt";
import seed from "./src/database/seed";
import { DEV_UUIDS } from "./src/database/dev-data";
import * as devData from "./src/database/dev-data";

async function runSeed() {
  try {
    console.log("Starting database seed with dev data...\n");

    // Hash passwords for dev users
    const demoPasswordHash = await bcrypt.hash("Password123!", 10);
    const adminPasswordHash = await bcrypt.hash("AdminPassword123!", 10);

    const devUsers = [
      {
        user_id: DEV_UUIDS.USERS.DEMO_USER,
        email: "demo@example.com",
        password_hash: demoPasswordHash,
        email_verified: true,
        is_active: true,
      },
    ];

    const devAdmins = [
      {
        admin_id: DEV_UUIDS.ADMINS.ROOT_ADMIN,
        email: "admin@example.com",
        password_hash: adminPasswordHash,
        root: true,
        email_verified: true,
        is_active: true,
      },
    ];

    await seed({
      usersData: devUsers,
      adminsData: devAdmins,
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
