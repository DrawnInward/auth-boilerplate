import { PoolClient } from "pg";
import { createOrganizationService } from "../../src/services";
import { Organization } from "@auth-boilerplate/shared";

// An org row with no owner membership is unreachable by anyone, so the two
// writes must share one transaction — that pairing is what these pin.

const CLIENT = { sentinel: "txn-client" } as unknown as PoolClient;
const OWNER_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "11111111-1111-1111-1111-111111111111";

const buildService = () => {
  const calls: {
    create: Array<{ dto: Record<string, unknown>; client: unknown }>;
    addMember: Array<{
      organizationId: string;
      member: Record<string, unknown>;
      invitedBy: unknown;
      client: unknown;
    }>;
    transactions: number;
  } = { create: [], addMember: [], transactions: 0 };

  const service = createOrganizationService({
    organizations: {
      createOrganization: async (dto, client) => {
        calls.create.push({ dto, client });
        return { id: ORG_ID, ...dto } as unknown as Organization;
      },
    },
    members: {
      addOrganizationMember: async (
        organizationId,
        member,
        invitedBy,
        client,
      ) => {
        calls.addMember.push({ organizationId, member, invitedBy, client });
        return {} as never;
      },
    },
    runTransaction: (fn) => {
      calls.transactions += 1;
      return fn(CLIENT);
    },
  });

  return { service, calls };
};

describe("organizationService.createOrganization", () => {
  it("creates the org and seats the owner through the same client", async () => {
    const { service, calls } = buildService();

    const org = await service.createOrganization({
      name: "Acme",
      slug: "acme",
      ownerId: OWNER_ID,
    });

    expect(org.id).toBe(ORG_ID);
    expect(calls.create).toEqual([
      {
        dto: { name: "Acme", slug: "acme", owner_id: OWNER_ID },
        client: CLIENT,
      },
    ]);
    expect(calls.addMember).toEqual([
      {
        organizationId: ORG_ID,
        member: { user_id: OWNER_ID, role: "owner" },
        invitedBy: null,
        client: CLIENT,
      },
    ]);
    expect(calls.transactions).toBe(1);
  });
});
