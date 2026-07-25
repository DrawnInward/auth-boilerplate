-- Boilerplate schema: users, admins, refresh tokens, organizations,
-- organization members, invitations, MFA backup codes.
--
-- Extracted verbatim from the inline DDL that seed() used to own. Schema now
-- lives ONLY in this directory: migrations are numbered, filename-ordered, and
-- IMMUTABLE once merged. Schema changes are always new files appended at the
-- end — never an edit to a migration that has already run somewhere.

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
    created_through VARCHAR(20) DEFAULT 'self_registered' CHECK (created_through IN ('self_registered', 'org_invited', 'admin_created')),
    can_create_orgs BOOLEAN NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('registration', 'org_invite', 'password_reset', 'email_change', 'admin_invite')),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(20) CHECK (role IN ('admin', 'member', 'viewer')),
    invited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    is_existing_user BOOLEAN DEFAULT FALSE,
    new_email VARCHAR(255),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mfa_backup_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL,
    role_type VARCHAR(20) NOT NULL CHECK (role_type IN ('user', 'admin')),
    code_hash VARCHAR(255) NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User and admin indexes
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_admins_deleted_at ON admins(deleted_at);
CREATE INDEX idx_admins_is_active ON admins(is_active);
CREATE INDEX idx_admins_email ON admins(email);

-- Refresh token indexes
CREATE INDEX idx_token_hash ON refresh(token_hash);
CREATE INDEX idx_role_active ON refresh(role_id, role_type, is_active);

-- Organization indexes
CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(role);

-- Invitation indexes
CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_type ON invitations(type);
CREATE INDEX idx_invitations_org ON invitations(organization_id) WHERE organization_id IS NOT NULL;

-- MFA and OAuth indexes
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_mfa_backup_codes_role ON mfa_backup_codes(role_id, role_type);
