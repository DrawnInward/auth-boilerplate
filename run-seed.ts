import seed from "./src/database/seed";
import * as devData from "./src/database/dev-data";

async function runSeed() {
  try {
    console.log("Starting database seed with dev data...\n");
    await seed({
      usersData: devData.devUsers,
      adminsData: devData.devAdmins,
      organizationsData: devData.devOrganizations,
      organizationMembersData: devData.devOrganizationMembers,
    });
    console.log("\n✓ Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n✗ Seed failed:", error);
    process.exit(1);
  }
}

runSeed();
