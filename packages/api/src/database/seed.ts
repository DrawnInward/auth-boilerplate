import { Organization, OrganizationMember } from "@auth-boilerplate/shared";
import { Admin, Invitation, RefreshToken, User } from "../types";
import db from "./db";

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
    log("Dropping existing tables...");
    await db.query("DROP TABLE IF EXISTS mfa_backup_codes CASCADE");
    await db.query("DROP TABLE IF EXISTS invitations CASCADE");
    await db.query("DROP TABLE IF EXISTS organization_members CASCADE");
    await db.query("DROP TABLE IF EXISTS organizations CASCADE");
    await db.query("DROP TABLE IF EXISTS refresh CASCADE");
    await db.query("DROP TABLE IF EXISTS admins CASCADE");
    await db.query("DROP TABLE IF EXISTS users CASCADE");

    log("Creating users table...");
    await db.query(`
      CREATE TABLE users (
          user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255),
          email_verified BOOLEAN DEFAULT false,
          deleted_at TIMESTAMPTZ NULL,
          is_active BOOLEAN DEFAULT true,
          deactivated_at TIMESTAMPTZ NULL,
          deactivated_by UUID NULL REFERENCES users(user_id),
          mfa_enabled BOOLEAN DEFAULT false,
          mfa_secret TEXT,
          google_id VARCHAR(255) UNIQUE,
          auth_provider VARCHAR(20) DEFAULT 'local' CHECK (auth_provider IN ('local', 'google', 'both')),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
          );
    `);

    log("Creating admins table...");
    await db.query(`
     CREATE TABLE admins (
          admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          root BOOLEAN DEFAULT false,
          email_verified BOOLEAN DEFAULT false,
          deleted_at TIMESTAMPTZ NULL,
          is_active BOOLEAN DEFAULT true,
          deactivated_at TIMESTAMPTZ NULL,
          deactivated_by UUID NULL REFERENCES admins(admin_id),
          mfa_enabled BOOLEAN DEFAULT false,
          mfa_secret TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
          );
    `);

    log("Creating refresh_tokens table...");
    await db.query(`
      CREATE TABLE refresh (
          refresh_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          role_id UUID NOT NULL,
          role_type VARCHAR(50) NOT NULL,
          token_hash VARCHAR(255) UNIQUE NOT NULL,
          expiration_time TIMESTAMPTZ NOT NULL,
          issued_time TIMESTAMPTZ NOT NULL,
          last_used_time TIMESTAMPTZ,
          is_active BOOLEAN DEFAULT TRUE,
          used_at TIMESTAMPTZ
        );
    `);

    log("Creating organizations table...");
    await db.query(`
      CREATE TABLE organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        owner_id UUID NOT NULL REFERENCES users(user_id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    log("Creating organization_members table...");
    await db.query(`
      CREATE TABLE organization_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        invited_by UUID REFERENCES users(user_id),
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, user_id)
      );
    `);

    log("Creating invitations table...");
    await db.query(`
      CREATE TABLE invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('registration', 'org_invite', 'password_reset')),
        organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        role VARCHAR(20) CHECK (role IN ('admin', 'member', 'viewer')),
        invited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
        is_existing_user BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    log("Creating mfa_backup_codes table...");
    await db.query(`
      CREATE TABLE mfa_backup_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role_id UUID NOT NULL,
        role_type VARCHAR(20) NOT NULL CHECK (role_type IN ('user', 'admin')),
        code_hash VARCHAR(255) NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    log("Creating indexes...");
    // User indexes
    await db.query(`CREATE INDEX idx_users_deleted_at ON users(deleted_at);`);
    await db.query(`CREATE INDEX idx_users_is_active ON users(is_active);`);
    await db.query(`CREATE INDEX idx_admins_deleted_at ON admins(deleted_at);`);
    await db.query(`CREATE INDEX idx_admins_is_active ON admins(is_active);`);
    await db.query(`CREATE INDEX idx_admins_email ON admins(email);`);

    // Refresh token indexes
    await db.query(`CREATE INDEX idx_token_hash ON refresh(token_hash);`);
    await db.query(
      `CREATE INDEX idx_role_active ON refresh(role_id, role_type, is_active);`,
    );

    // Organization indexes
    await db.query(
      `CREATE INDEX idx_organizations_owner ON organizations(owner_id);`,
    );
    await db.query(
      `CREATE INDEX idx_organizations_slug ON organizations(slug);`,
    );
    await db.query(
      `CREATE INDEX idx_org_members_org ON organization_members(organization_id);`,
    );
    await db.query(
      `CREATE INDEX idx_org_members_user ON organization_members(user_id);`,
    );
    await db.query(
      `CREATE INDEX idx_org_members_role ON organization_members(role);`,
    );

    // Invitation indexes
    await db.query(
      `CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);`,
    );
    await db.query(
      `CREATE INDEX idx_invitations_email ON invitations(email);`,
    );
    await db.query(
      `CREATE INDEX idx_invitations_type ON invitations(type);`,
    );
    await db.query(
      `CREATE INDEX idx_invitations_org ON invitations(organization_id) WHERE organization_id IS NOT NULL;`,
    );

    // MFA and OAuth indexes
    await db.query(
      `CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;`,
    );
    await db.query(
      `CREATE INDEX idx_mfa_backup_codes_role ON mfa_backup_codes(role_id, role_type);`,
    );

    log("Inserting users...");
    for (const user of usersData) {
      const query = user.user_id
        ? "INSERT INTO users (user_id, email, password_hash, email_verified, is_active) VALUES ($1, $2, $3, $4, $5)"
        : "INSERT INTO users (email, password_hash, email_verified, is_active) VALUES ($1, $2, $3, $4)";

      const values = user.user_id
        ? [
            user.user_id,
            user.email,
            user.password_hash,
            user.email_verified,
            user.is_active || false,
          ]
        : [
            user.email,
            user.password_hash,
            user.email_verified,
            user.is_active || false,
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
