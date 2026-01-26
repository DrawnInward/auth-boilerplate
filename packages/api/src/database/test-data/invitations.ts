import { determinateHash } from "../../utils";
import { TEST_UUIDS, getUserUuid, getOrganizationUuid } from "./testUuids";

export const TEST_TOKENS = {
  VALID_REGISTRATION: "test-registration-token-valid",
  EXPIRED_REGISTRATION: "test-registration-token-expired",
  USED_REGISTRATION: "test-registration-token-used",
  VALID_ORG_INVITE: "test-org-invite-token-valid",
  EXPIRED_ORG_INVITE: "test-org-invite-token-expired",
  USED_ORG_INVITE: "test-org-invite-token-used",
  VALID_PASSWORD_RESET: "test-password-reset-token-valid",
  EXPIRED_PASSWORD_RESET: "test-password-reset-token-expired",
  USED_PASSWORD_RESET: "test-password-reset-token-used",
  ORG_INVITE_EXISTING_USER: "test-org-invite-existing-user",
};

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago

export const testInvitations = [
  // Valid registration invitation for a new email
  {
    id: TEST_UUIDS.INVITATIONS.VALID_REGISTRATION,
    email: "newuser@example.com",
    token_hash: determinateHash(TEST_TOKENS.VALID_REGISTRATION),
    type: "registration" as const,
    organization_id: null,
    role: null,
    invited_by: null,
    is_existing_user: false,
    expires_at: futureDate,
    used_at: null,
  },
  // Expired registration invitation
  {
    id: TEST_UUIDS.INVITATIONS.EXPIRED_REGISTRATION,
    email: "expired@example.com",
    token_hash: determinateHash(TEST_TOKENS.EXPIRED_REGISTRATION),
    type: "registration" as const,
    organization_id: null,
    role: null,
    invited_by: null,
    is_existing_user: false,
    expires_at: pastDate,
    used_at: null,
  },
  // Already used registration invitation
  {
    id: TEST_UUIDS.INVITATIONS.USED_REGISTRATION,
    email: "usedregistration@example.com",
    token_hash: determinateHash(TEST_TOKENS.USED_REGISTRATION),
    type: "registration" as const,
    organization_id: null,
    role: null,
    invited_by: null,
    is_existing_user: false,
    expires_at: futureDate,
    used_at: new Date().toISOString(),
  },
  // Valid org invitation for new user
  {
    id: TEST_UUIDS.INVITATIONS.VALID_ORG_INVITE,
    email: "neworginvitee@example.com",
    token_hash: determinateHash(TEST_TOKENS.VALID_ORG_INVITE),
    type: "org_invite" as const,
    organization_id: getOrganizationUuid(1), // ACME_CORP
    role: "member" as const,
    invited_by: getUserUuid(1), // TEST_USER
    is_existing_user: false,
    expires_at: futureDate,
    used_at: null,
  },
  // Expired org invitation
  {
    id: TEST_UUIDS.INVITATIONS.EXPIRED_ORG_INVITE,
    email: "expiredorginvitee@example.com",
    token_hash: determinateHash(TEST_TOKENS.EXPIRED_ORG_INVITE),
    type: "org_invite" as const,
    organization_id: getOrganizationUuid(1), // ACME_CORP
    role: "member" as const,
    invited_by: getUserUuid(1), // TEST_USER
    is_existing_user: false,
    expires_at: pastDate,
    used_at: null,
  },
  // Used org invitation
  {
    id: TEST_UUIDS.INVITATIONS.USED_ORG_INVITE,
    email: "usedorginvitee@example.com",
    token_hash: determinateHash(TEST_TOKENS.USED_ORG_INVITE),
    type: "org_invite" as const,
    organization_id: getOrganizationUuid(1), // ACME_CORP
    role: "member" as const,
    invited_by: getUserUuid(1), // TEST_USER
    is_existing_user: false,
    expires_at: futureDate,
    used_at: new Date().toISOString(),
  },
  // Valid password reset for existing user (test@example.com)
  {
    id: TEST_UUIDS.INVITATIONS.VALID_PASSWORD_RESET,
    email: "test@example.com",
    token_hash: determinateHash(TEST_TOKENS.VALID_PASSWORD_RESET),
    type: "password_reset" as const,
    organization_id: null,
    role: null,
    invited_by: null,
    is_existing_user: true,
    expires_at: futureDate,
    used_at: null,
  },
  // Expired password reset
  {
    id: TEST_UUIDS.INVITATIONS.EXPIRED_PASSWORD_RESET,
    email: "test@example.com",
    token_hash: determinateHash(TEST_TOKENS.EXPIRED_PASSWORD_RESET),
    type: "password_reset" as const,
    organization_id: null,
    role: null,
    invited_by: null,
    is_existing_user: true,
    expires_at: pastDate,
    used_at: null,
  },
  // Used password reset
  {
    id: TEST_UUIDS.INVITATIONS.USED_PASSWORD_RESET,
    email: "test@example.com",
    token_hash: determinateHash(TEST_TOKENS.USED_PASSWORD_RESET),
    type: "password_reset" as const,
    organization_id: null,
    role: null,
    invited_by: null,
    is_existing_user: true,
    expires_at: futureDate,
    used_at: new Date().toISOString(),
  },
  // Org invite for existing user (alice@example.com invited to Bob's Team)
  {
    id: TEST_UUIDS.INVITATIONS.ORG_INVITE_EXISTING_USER,
    email: "alice@example.com",
    token_hash: determinateHash(TEST_TOKENS.ORG_INVITE_EXISTING_USER),
    type: "org_invite" as const,
    organization_id: getOrganizationUuid(2), // BOBS_TEAM
    role: "admin" as const,
    invited_by: getUserUuid(3), // BOB
    is_existing_user: true,
    expires_at: futureDate,
    used_at: null,
  },
];
