-- S9: server-side record of issued MFA challenge tokens, so a challenge is
-- single-use and bounded to a fixed number of code attempts. Rows share the
-- JWT's 5-minute lifetime and are opportunistically deleted once expired.
CREATE TABLE mfa_challenges (
    jti UUID PRIMARY KEY,
    role_id UUID NOT NULL,
    role_type VARCHAR(50) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_challenges_expires_at ON mfa_challenges(expires_at);
