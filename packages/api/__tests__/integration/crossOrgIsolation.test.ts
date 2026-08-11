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
import { loginAs } from "../helpers/loginAs";

require("dotenv").config({ quiet: true });

// B3: the cross-org boundary, asserted for every org-scoped endpoint in one
// place. Alice is not a member of Bob's Team; every request she makes against
// it must 403, whatever her role is elsewhere. Fresh seed, no mutations —
// every test here is read-only from the fixtures' point of view (each 403
// happens before the handler runs).

describe("Cross-organization isolation (B3)", () => {
  let aliceCookies: string;

  const bobsTeamId = getOrganizationUuid(2); // BOBS_TEAM — alice is not a member
  const bobId = getUserUuid(3);

  beforeAll(async () => {
    await seed({
      usersData: testUsers,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
    });

    aliceCookies = await loginAs("alice@example.com");
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

  // Walk the real Express router (same approach as roleBoundary.test.ts) so
  // this case list can't silently fall behind the app: a new org-scoped
  // route without an isolation case fails the sweep.
  function collectRegisteredRoutes(stack: any[]): string[] {
    const out: string[] = [];
    for (const layer of stack) {
      if (layer.route) {
        const methods: string[] = layer.route.methods
          ? Object.keys(layer.route.methods)
          : layer.route.stack.map((l: any) => l.method);
        for (const method of methods) {
          out.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        out.push(...collectRegisteredRoutes(layer.handle.stack));
      }
    }
    return out;
  }

  const UUID_RE =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

  it("covers every org-scoped route the app registers (completeness)", () => {
    const router = (app as any).router ?? (app as any)._router;
    // Shapes are compared as sets: the admin organization router registers
    // the same membership tails (mounted under /api/admin), and those
    // collapse into the user-side entries this suite already covers.
    const registered = new Set(
      collectRegisteredRoutes(router.stack)
        .filter((r) => r.split(" ")[1].startsWith("/:organizationId"))
        .map((r) => r.replace(/:[^/]+/g, "*")),
    );
    const covered = new Set(
      cases.map((c) => {
        const tail = c.path
          .split("?")[0]
          .replace(`/api/organizations/${bobsTeamId}`, "")
          .replace(UUID_RE, "*");
        return `${c.method.toUpperCase()} /*${tail}`;
      }),
    );

    expect([...covered].sort()).toEqual([...registered].sort());
  });

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
