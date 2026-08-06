-- Platform admins are now invited over HTTP (D3 admin-management slice): the
-- root admin sends an invitation and the recipient completes registration
-- themselves, mirroring the user flow. The invitations.type vocabulary gains
-- 'admin_registration' ("become a platform admin" — distinct from the existing
-- 'admin_invite', which is an admin inviting a *user*). The constraint is
-- recreated under its original name and must stay mirrored by INVITATION_TYPES
-- in the shared package.
ALTER TABLE invitations DROP CONSTRAINT invitations_type_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_type_check
  CHECK (type IN ('registration', 'org_invite', 'password_reset', 'email_change', 'admin_invite', 'admin_registration'));
