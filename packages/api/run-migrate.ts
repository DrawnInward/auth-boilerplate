import db from "./src/database/db";
import { runMigrations } from "./src/database/migrate";

// Applies any migrations that have not run yet, in filename order. Safe to run
// repeatedly — already-applied files are skipped. Unlike seed(), this never
// drops anything, so it is the only schema command safe outside dev.
async function runMigrate() {
  try {
    console.log("Applying pending migrations...\n");

    const { applied, skipped } = await runMigrations(db, {
      log: (message) => console.log(`  ${message}`),
    });

    console.log(
      `\n✓ ${applied.length} applied, ${skipped.length} already up to date.`,
    );
    process.exit(0);
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    process.exit(1);
  }
}

runMigrate();
