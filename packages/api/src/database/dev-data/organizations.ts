import { DEV_UUIDS } from "./devUuids";

export const devOrganizations = [
  {
    id: DEV_UUIDS.ORGANIZATIONS.DEMO_ORG,
    name: "Demo Organization",
    slug: "demo-org",
    owner_id: DEV_UUIDS.USERS.DEMO_USER,
  },
];

export const devOrganizationMembers = [
  {
    id: DEV_UUIDS.ORG_MEMBERS.DEMO_ORG_OWNER,
    organization_id: DEV_UUIDS.ORGANIZATIONS.DEMO_ORG,
    user_id: DEV_UUIDS.USERS.DEMO_USER,
    role: "owner" as const,
    invited_by: null,
  },
];
