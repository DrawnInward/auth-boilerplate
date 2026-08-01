import request from "supertest";
import { randomUUID } from "crypto";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import {
  testUsers,
  testOrganizations,
  testOrganizationMembers,
} from "../../src/database/test-data";
import {
  getUserUuid,
  getOrganizationUuid,
} from "../../src/database/test-data/testUuids";

require("dotenv").config({ quiet: true });

// B3: the cross-org boundary, asserted for every org-scoped endpoint in one
// place. Alice is not a member of Bob's Team; every request she makes against
// it must 403, whatever her role is elsewhere. Fresh seed, no mutations —
// every test here is read-only from the fixtures' point of view (each 403
// happens before the handler runs).

describe("Cross-organization isolation (B3)", () => {
  let aliceCookies: string[];

  const bobsTeamId = getOrganizationUuid(2); // BOBS_TEAM — alice is not a member
  const bobId = getUserUuid(3);

  beforeAll(async () => {
    await seed({
      usersData: testUsers,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "Password1" })
      .expect(200);
    aliceCookies = login.headers["set-cookie"] as unknown as string[];
  });

  afterAll(async () => {
    await db.end();
  });

  interface CrossOrgCase {
    name: string;
    method: "get" | "post" | "put" | "delete";
    path: string;
    body?: Record<string, unknown>;
  }

  const cases: CrossOrgCase[] = [
    {
      name: "GET organization detail",
      method: "get",
      path: `/api/organizations/${bobsTeamId}`,
    },
    {
      name: "PUT organization",
      method: "put",
      path: `/api/organizations/${bobsTeamId}`,
      body: { name: "Hijacked" },
    },
    {
      name: "DELETE organization",
      method: "delete",
      path: `/api/organizations/${bobsTeamId}`,
    },
    {
      name: "GET members",
      method: "get",
      path: `/api/organizations/${bobsTeamId}/members`,
    },
    {
      name: "POST member",
      method: "post",
      path: `/api/organizations/${bobsTeamId}/members`,
      body: { user_id: getUserUuid(2), role: "member" },
    },
    {
      name: "PUT member role",
      method: "put",
      path: `/api/organizations/${bobsTeamId}/members/${bobId}`,
      body: { role: "member" },
    },
    {
      name: "DELETE member",
      method: "delete",
      path: `/api/organizations/${bobsTeamId}/members/${bobId}`,
    },
    {
      name: "POST transfer-ownership",
      method: "post",
      path: `/api/organizations/${bobsTeamId}/transfer-ownership`,
      body: { newOwnerId: getUserUuid(2) },
    },
    {
      name: "POST leave",
      method: "post",
      path: `/api/organizations/${bobsTeamId}/leave`,
    },
    {
      name: "POST invite",
      method: "post",
      path: `/api/organizations/${bobsTeamId}/invite`,
      body: { email: "intruder@example.com", role: "member" },
    },
    {
      name: "GET invitations",
      method: "get",
      path: `/api/organizations/${bobsTeamId}/invitations`,
    },
    {
      name: "DELETE invitation",
      method: "delete",
      path: `/api/organizations/${bobsTeamId}/invitations/${randomUUID()}`,
    },
  ];

  describe("a non-member is rejected on every org-scoped endpoint", () => {
    it.each(cases.map((c) => [c.name, c]))("%s → 403", async (_name, c) => {
      const { method, path, body } = c as CrossOrgCase;
      const agent = request(app);
      const req = agent[method](path).set("Cookie", aliceCookies);
      const response = await (body ? req.send(body) : req).expect(403);

      expect(response.body.status).toBe("error");
    });
  });

  it("Bob's Team is untouched by all of the above", async () => {
    const members = await db.query(
      "SELECT user_id FROM organization_members WHERE organization_id = $1",
      [bobsTeamId],
    );
    expect(members.rows).toHaveLength(1);
    expect(members.rows[0].user_id).toBe(bobId);

    const org = await db.query("SELECT name FROM organizations WHERE id = $1", [
      bobsTeamId,
    ]);
    expect(org.rows[0].name).toBe("Bob's Team");
  });
});
