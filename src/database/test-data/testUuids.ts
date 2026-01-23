// Predefined UUIDs for test data to maintain referential integrity
// These are deterministic UUIDs that ensure consistent foreign key relationships

export const TEST_UUIDS = {
  USERS: {
    TEST_USER: "550e8400-e29b-41d4-a716-446655440001",
    ALICE: "550e8400-e29b-41d4-a716-446655440002",
    BOB: "550e8400-e29b-41d4-a716-446655440003",
  },

  ADMINS: {
    ROOT_ADMIN: "550e8400-e29b-41d4-a716-446655440004",
    REGULAR_ADMIN: "550e8400-e29b-41d4-a716-446655440005",
    DEACTIVATED_ADMIN: "550e8400-e29b-41d4-a716-446655440006",
    UNVERIFIED_ADMIN: "550e8400-e29b-41d4-a716-446655440007",
    RECENT_DEACTIVATED: "550e8400-e29b-41d4-a716-446655440008",
  },

  ORGANIZATIONS: {
    ACME_CORP: "550e8400-e29b-41d4-a716-446655440010",
    BOBS_TEAM: "550e8400-e29b-41d4-a716-446655440011",
    ALICE_STARTUP: "550e8400-e29b-41d4-a716-446655440012",
    SHARED_PROJECT: "550e8400-e29b-41d4-a716-446655440013",
  },

  ORG_MEMBERS: {
    ACME_OWNER: "550e8400-e29b-41d4-a716-446655440020",
    ACME_ALICE_ADMIN: "550e8400-e29b-41d4-a716-446655440021",
    ACME_BOB_MEMBER: "550e8400-e29b-41d4-a716-446655440022",
    BOBS_OWNER: "550e8400-e29b-41d4-a716-446655440023",
    ALICE_OWNER: "550e8400-e29b-41d4-a716-446655440024",
    SHARED_TEST_USER: "550e8400-e29b-41d4-a716-446655440025",
    SHARED_ALICE: "550e8400-e29b-41d4-a716-446655440026",
    SHARED_BOB: "550e8400-e29b-41d4-a716-446655440027",
  },

  REFRESH_TOKENS: Array.from(
    { length: 20 },
    (_, i) =>
      `550e8400-e29b-41d4-a716-44665544${(950 + i)
        .toString()
        .padStart(4, "0")
        .slice(-4)}`,
  ),

  RULE_TEMPLATES: Array.from(
    { length: 20 },
    (_, i) =>
      `550e8400-e29b-41d4-a816-${(0x44665544160 + i)
        .toString(16)
        .padStart(12, "0")}`,
  ),
};

export function getTestUuid(
  category: keyof typeof TEST_UUIDS,
  index: number,
): string {
  const uuids = TEST_UUIDS[category];
  if (Array.isArray(uuids) && uuids[index]) {
    return uuids[index];
  }
  throw new Error(`Invalid UUID request: ${String(category)}[${index}]`);
}

export function getUserUuid(userIndex: 1 | 2 | 3): string {
  const userMap = [
    TEST_UUIDS.USERS.TEST_USER,
    TEST_UUIDS.USERS.ALICE,
    TEST_UUIDS.USERS.BOB,
  ];
  return userMap[userIndex - 1];
}

export function getAdminUuid(adminIndex: 1 | 2 | 3 | 4 | 5): string {
  const adminMap = [
    TEST_UUIDS.ADMINS.ROOT_ADMIN,
    TEST_UUIDS.ADMINS.REGULAR_ADMIN,
    TEST_UUIDS.ADMINS.DEACTIVATED_ADMIN,
    TEST_UUIDS.ADMINS.UNVERIFIED_ADMIN,
    TEST_UUIDS.ADMINS.RECENT_DEACTIVATED,
  ];
  return adminMap[adminIndex - 1];
}

export function getRefreshUuid(refreshTokenIndex: number): string {
  if (
    refreshTokenIndex < 1 ||
    refreshTokenIndex > TEST_UUIDS.REFRESH_TOKENS.length
  ) {
    throw new Error(
      `Invalid slot index: ${refreshTokenIndex}. Must be 1-${TEST_UUIDS.REFRESH_TOKENS.length}`,
    );
  }
  return TEST_UUIDS.REFRESH_TOKENS[refreshTokenIndex - 1];
}

export function getOrganizationUuid(orgIndex: 1 | 2 | 3 | 4): string {
  const orgMap = [
    TEST_UUIDS.ORGANIZATIONS.ACME_CORP,
    TEST_UUIDS.ORGANIZATIONS.BOBS_TEAM,
    TEST_UUIDS.ORGANIZATIONS.ALICE_STARTUP,
    TEST_UUIDS.ORGANIZATIONS.SHARED_PROJECT,
  ];
  return orgMap[orgIndex - 1];
}

export function getOrgMemberUuid(memberIndex: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): string {
  const memberMap = [
    TEST_UUIDS.ORG_MEMBERS.ACME_OWNER,
    TEST_UUIDS.ORG_MEMBERS.ACME_ALICE_ADMIN,
    TEST_UUIDS.ORG_MEMBERS.ACME_BOB_MEMBER,
    TEST_UUIDS.ORG_MEMBERS.BOBS_OWNER,
    TEST_UUIDS.ORG_MEMBERS.ALICE_OWNER,
    TEST_UUIDS.ORG_MEMBERS.SHARED_TEST_USER,
    TEST_UUIDS.ORG_MEMBERS.SHARED_ALICE,
    TEST_UUIDS.ORG_MEMBERS.SHARED_BOB,
  ];
  return memberMap[memberIndex - 1];
}

export function getRoleUuid(index: number, roleType: "user" | "admin"): string {
  if (roleType === "user") {
    return getUserUuid(index as 1 | 2 | 3);
  } else {
    return getAdminUuid(index as 1 | 2 | 3 | 4 | 5);
  }
}
