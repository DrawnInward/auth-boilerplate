import { TEST_UUIDS, getUserUuid } from "./testUuids";

export const testOrganizations = [
  {
    id: TEST_UUIDS.ORGANIZATIONS.ACME_CORP,
    name: "Acme Corporation",
    slug: "acme-corp",
    owner_id: getUserUuid(1), // TEST_USER
  },
  {
    id: TEST_UUIDS.ORGANIZATIONS.BOBS_TEAM,
    name: "Bob's Team",
    slug: "bobs-team",
    owner_id: getUserUuid(3), // BOB
  },
  {
    id: TEST_UUIDS.ORGANIZATIONS.ALICE_STARTUP,
    name: "Alice's Startup",
    slug: "alice-startup",
    owner_id: getUserUuid(2), // ALICE
  },
  {
    id: TEST_UUIDS.ORGANIZATIONS.SHARED_PROJECT,
    name: "Shared Project",
    slug: "shared-project",
    owner_id: getUserUuid(1), // TEST_USER owns it
  },
];

export const testOrganizationMembers = [
  // Acme Corp members
  {
    id: TEST_UUIDS.ORG_MEMBERS.ACME_OWNER,
    organization_id: TEST_UUIDS.ORGANIZATIONS.ACME_CORP,
    user_id: getUserUuid(1), // TEST_USER is owner
    role: "owner" as const,
    invited_by: null,
  },
  {
    id: TEST_UUIDS.ORG_MEMBERS.ACME_ALICE_ADMIN,
    organization_id: TEST_UUIDS.ORGANIZATIONS.ACME_CORP,
    user_id: getUserUuid(2), // ALICE is admin
    role: "admin" as const,
    invited_by: getUserUuid(1),
  },
  {
    id: TEST_UUIDS.ORG_MEMBERS.ACME_BOB_MEMBER,
    organization_id: TEST_UUIDS.ORGANIZATIONS.ACME_CORP,
    user_id: getUserUuid(3), // BOB is member
    role: "member" as const,
    invited_by: getUserUuid(1),
  },

  // Bob's Team - just Bob
  {
    id: TEST_UUIDS.ORG_MEMBERS.BOBS_OWNER,
    organization_id: TEST_UUIDS.ORGANIZATIONS.BOBS_TEAM,
    user_id: getUserUuid(3), // BOB is owner
    role: "owner" as const,
    invited_by: null,
  },

  // Alice's Startup - just Alice
  {
    id: TEST_UUIDS.ORG_MEMBERS.ALICE_OWNER,
    organization_id: TEST_UUIDS.ORGANIZATIONS.ALICE_STARTUP,
    user_id: getUserUuid(2), // ALICE is owner
    role: "owner" as const,
    invited_by: null,
  },

  // Shared Project - all three users
  {
    id: TEST_UUIDS.ORG_MEMBERS.SHARED_TEST_USER,
    organization_id: TEST_UUIDS.ORGANIZATIONS.SHARED_PROJECT,
    user_id: getUserUuid(1), // TEST_USER is owner
    role: "owner" as const,
    invited_by: null,
  },
  {
    id: TEST_UUIDS.ORG_MEMBERS.SHARED_ALICE,
    organization_id: TEST_UUIDS.ORGANIZATIONS.SHARED_PROJECT,
    user_id: getUserUuid(2), // ALICE is member
    role: "member" as const,
    invited_by: getUserUuid(1),
  },
  {
    id: TEST_UUIDS.ORG_MEMBERS.SHARED_BOB,
    organization_id: TEST_UUIDS.ORGANIZATIONS.SHARED_PROJECT,
    user_id: getUserUuid(3), // BOB is viewer
    role: "viewer" as const,
    invited_by: getUserUuid(1),
  },
];
