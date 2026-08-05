-- Organizations are soft-deleted from here on: rows persist so anything that
-- references an organization (audit trails, and downstream consumers that FK
-- financial history to it) keeps a valid target forever. All reads filter
-- deleted_at IS NULL at the model layer.
ALTER TABLE organizations ADD COLUMN deleted_at TIMESTAMPTZ;

-- Slug uniqueness applies to live organizations only — a deleted organization
-- must not reserve its slug forever. The partial index replaces the original
-- constraint under the same name.
ALTER TABLE organizations DROP CONSTRAINT organizations_slug_key;
CREATE UNIQUE INDEX organizations_slug_key
  ON organizations (slug)
  WHERE deleted_at IS NULL;
