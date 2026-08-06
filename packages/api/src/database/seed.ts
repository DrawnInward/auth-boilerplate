import {
  Invitation,
  Organization,
  OrganizationMember,
} from "@auth-boilerplate/shared";
import { Admin, RefreshToken, User } from "../types";
import db from "./db";
import { runMigrations } from "./migrate";

async function seed({
  usersData = [],
  adminsData = [],
  refreshTokensData = [],
  organizationsData = [],
  organizationMembersData = [],
  invitationsData = [],

  verbose = false,
}: {
  usersData?: User[];
  adminsData?: Admin[];
  refreshTokensData?: RefreshToken[];
  organizationsData?: Organization[];
  organizationMembersData?: OrganizationMember[];
  invitationsData?: Invitation[];
  verbose?: boolean;
}) {
  if (process.env.NODE_ENV === "production") {
    console.log("This function cannot run in a production environment");
    return;
  }

  const log = (message: string) => {
    if (verbose) {
      console.log(message);
    }
  };

  try {
    // Drop everything in the schema (including the migrations tracking table)
    // so the migrations replay from scratch. src/database/migrations is the
    // single source of truth for schema; seed() no longer owns any DDL.
    log("Dropping existing tables...");
    const { rows: existing } = await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    for (const { tablename } of existing) {
      await db.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
    }

    log("Running migrations...");
    await runMigrations(db, { log });

    log("Inserting users...");
    for (const user of usersData) {
      const query = user.user_id
        ? "INSERT INTO users (user_id, email, password_hash, email_verified, is_active, created_through, can_create_orgs) VALUES ($1, $2, $3, $4, $5, $6, $7)"
        : "INSERT INTO users (email, password_hash, email_verified, is_active, created_through, can_create_orgs) VALUES ($1, $2, $3, $4, $5, $6)";

      const values = user.user_id
        ? [
            user.user_id,
            user.email,
            user.password_hash,
            user.email_verified,
            user.is_active || false,
            user.created_through || "self_registered",
            user.can_create_orgs ?? null,
          ]
        : [
            user.email,
            user.password_hash,
            user.email_verified,
            user.is_active || false,
            user.created_through || "self_registered",
            user.can_create_orgs ?? null,
          ];

      await db.query(query, values);
    }

    for (const admin of adminsData) {
      await db.query(
        "INSERT INTO admins (admin_id, email, password_hash, root, email_verified, is_active, deactivated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          admin.admin_id,
          admin.email,
          admin.password_hash,
          admin.root || false,
          admin.email_verified,
          admin.is_active,
          admin.deactivated_at || null,
        ],
      );
    }

    log("Inserting refresh tokens...");
    for (const token of refreshTokensData) {
      await db.query(
        "INSERT INTO refresh (refresh_id, role_id, role_type, token_hash, expiration_time, issued_time, last_used_time, is_active, used_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          token.refresh_id,
          token.role_id,
          token.role_type,
          token.token_hash,
          token.expiration_time ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          token.issued_time || new Date().toISOString(),
          token.last_used_time || null,
          token.is_active !== undefined ? token.is_active : true,
          token.used_at || null,
        ],
      );
    }

    log("Inserting organizations...");
    for (const org of organizationsData) {
      const query = org.id
        ? "INSERT INTO organizations (id, name, slug, owner_id) VALUES ($1, $2, $3, $4)"
        : "INSERT INTO organizations (name, slug, owner_id) VALUES ($1, $2, $3)";

      const values = org.id
        ? [org.id, org.name, org.slug, org.owner_id]
        : [org.name, org.slug, org.owner_id];

      await db.query(query, values);
    }

    log("Inserting organization members...");
    for (const member of organizationMembersData) {
      const query = member.id
        ? "INSERT INTO organization_members (id, organization_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4, $5)"
        : "INSERT INTO organization_members (organization_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4)";

      const values = member.id
        ? [
            member.id,
            member.organization_id,
            member.user_id,
            member.role,
            member.invited_by || null,
          ]
        : [
            member.organization_id,
            member.user_id,
            member.role,
            member.invited_by || null,
          ];

      await db.query(query, values);
    }

    log("Inserting invitations...");
    for (const invitation of invitationsData) {
      const query = invitation.id
        ? `INSERT INTO invitations (id, email, token_hash, type, organization_id, role, invited_by, is_existing_user, expires_at, used_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
        : `INSERT INTO invitations (email, token_hash, type, organization_id, role, invited_by, is_existing_user, expires_at, used_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

      const values = invitation.id
        ? [
            invitation.id,
            invitation.email,
            invitation.token_hash,
            invitation.type,
            invitation.organization_id || null,
            invitation.role || null,
            invitation.invited_by || null,
            invitation.is_existing_user || false,
            invitation.expires_at,
            invitation.used_at || null,
            invitation.created_at || new Date().toISOString(),
          ]
        : [
            invitation.email,
            invitation.token_hash,
            invitation.type,
            invitation.organization_id || null,
            invitation.role || null,
            invitation.invited_by || null,
            invitation.is_existing_user || false,
            invitation.expires_at,
            invitation.used_at || null,
          ];

      await db.query(query, values);
    }

    log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

export default seed;
