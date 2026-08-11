import request from "supertest";
import { randomUUID } from "crypto";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import {
  testUsers,
  testAdmins,
  testOrganizations,
  testOrganizationMembers,
} from "../../src/database/test-data";
import {
  getUserUuid,
  getOrganizationUuid,
} from "../../src/database/test-data/testUuids";

require("dotenv").config({ quiet: true });

// B2: characterisation spec for the admin organization routes — the largest
// route group that previously had no spec at all. 401/unauthenticated and
// 403/wrong-role for every route here are asserted by roleBoundary.test.ts.

describe("Admin Organization Management Integration Tests", () => {
  let adminCookies: string[];
  // Mutation tests act on this throwaway org (created below), never on the
  // seeded fixtures — other suites in the same DB lifetime assert against
  // the fixture rows by name and membership.
  let mutationOrgId: string;

  const acmeId = getOrganizationUuid(1); // ACME_CORP

  beforeAll(async () => {
    await seed({
      usersData: testUsers,
      adminsData: testAdmins,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
    });

    const loginResponse = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "root.admin@test.com", password: "Password1" })
      .expect(200);
    adminCookies = loginResponse.headers["set-cookie"] as unknown as string[];

    const created = await request(app)
      .post("/api/admin/organizations")
      .set("Cookie", adminCookies)
      .send({ name: "Member Mutation Org", owner_id: getUserUuid(1) })
      .expect(201);
    mutationOrgId = created.body.data.id;
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/admin/organizations", () => {
    it("creates an organization for the given owner", async () => {
      const response = await request(app)
        .post("/api/admin/organizations")
        .set("Cookie", adminCookies)
        .send({ name: "Admin Created Org", owner_id: getUserUuid(1) })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Organization created successfully");
      expect(response.body.data.name).toBe("Admin Created Org");
      expect(response.body.data.owner_id).toBe(getUserUuid(1));
    });

    it("rejects a missing owner_id", async () => {
      await request(app)
        .post("/api/admin/organizations")
        .set("Cookie", adminCookies)
        .send({ name: "No Owner Org" })
        .expect(400);
    });

    it("rejects a missing name", async () => {
      await request(app)
        .post("/api/admin/organizations")
        .set("Cookie", adminCookies)
        .send({ owner_id: getUserUuid(1) })
        .expect(400);
    });
  });

  describe("GET /api/admin/organizations", () => {
    it("lists every organization", async () => {
      const response = await request(app)
        .get("/api/admin/organizations")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(Array.isArray(response.body.data)).toBe(true);

      const names = response.body.data.map((org: any) => org.name);
      expect(names).toEqual(expect.arrayContaining(["Acme Corporation"]));
    });
  });

  describe("GET /api/admin/organizations/stats", () => {
    it("returns organization statistics", async () => {
      const response = await request(app)
        .get("/api/admin/organizations/stats")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.total).toBeGreaterThanOrEqual(4);
    });
  });

  describe("GET /api/admin/organizations/:organizationId", () => {
    it("retrieves an organization by id", async () => {
      const response = await request(app)
        .get(`/api/admin/organizations/${acmeId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.data.id).toBe(acmeId);
      expect(response.body.data.name).toBe("Acme Corporation");
    });

    it("404s for an unknown organization", async () => {
      await request(app)
        .get(`/api/admin/organizations/${randomUUID()}`)
        .set("Cookie", adminCookies)
        .expect(404);
    });

    it("400s for a malformed organization id", async () => {
      await request(app)
        .get("/api/admin/organizations/not-a-uuid")
        .set("Cookie", adminCookies)
        .expect(400);
    });
  });

  describe("PUT /api/admin/organizations/:organizationId", () => {
    it("updates an organization's name", async () => {
      const created = await request(app)
        .post("/api/admin/organizations")
        .set("Cookie", adminCookies)
        .send({ name: "Rename Me Org", owner_id: getUserUuid(1) })
        .expect(201);

      const response = await request(app)
        .put(`/api/admin/organizations/${created.body.data.id}`)
        .set("Cookie", adminCookies)
        .send({ name: "Renamed Org" })
        .expect(200);

      expect(response.body.data.name).toBe("Renamed Org");
    });

    it("404s for an unknown organization", async () => {
      await request(app)
        .put(`/api/admin/organizations/${randomUUID()}`)
        .set("Cookie", adminCookies)
        .send({ name: "Ghost Org" })
        .expect(404);
    });
  });

  describe("DELETE /api/admin/organizations/:organizationId", () => {
    it("deletes an organization", async () => {
      const created = await request(app)
        .post("/api/admin/organizations")
        .set("Cookie", adminCookies)
        .send({ name: "Doomed Org", owner_id: getUserUuid(1) })
        .expect(201);

      const doomedId = created.body.data.id;

      await request(app)
        .delete(`/api/admin/organizations/${doomedId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      await request(app)
        .get(`/api/admin/organizations/${doomedId}`)
        .set("Cookie", adminCookies)
        .expect(404);
    });

    it("404s for an unknown organization", async () => {
      await request(app)
        .delete(`/api/admin/organizations/${randomUUID()}`)
        .set("Cookie", adminCookies)
        .expect(404);
    });
  });

  describe("GET /api/admin/organizations/:organizationId/members", () => {
    it("lists an organization's members", async () => {
      const response = await request(app)
        .get(`/api/admin/organizations/${acmeId}/members`)
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it("404s for an unknown organization", async () => {
      await request(app)
        .get(`/api/admin/organizations/${randomUUID()}/members`)
        .set("Cookie", adminCookies)
        .expect(404);
    });
  });

  // Each member-mutation describe arranges alice's membership in the
  // throwaway org itself (no cross-describe ordering), so filtered runs
  // (jest -t) and reordering can't break them.
  const removeAlice = () =>
    request(app)
      .delete(
        `/api/admin/organizations/${mutationOrgId}/members/${getUserUuid(2)}`,
      )
      .set("Cookie", adminCookies);

  const ensureAliceIsMember = async () => {
    // 201 on first add; the duplicate-membership rejection on reruns is fine.
    await request(app)
      .post(`/api/admin/organizations/${mutationOrgId}/members`)
      .set("Cookie", adminCookies)
      .send({ user_id: getUserUuid(2), role: "member" });
  };

  describe("POST /api/admin/organizations/:organizationId/members", () => {
    beforeEach(async () => {
      await removeAlice(); // whatever earlier tests left behind
    });

    it("adds a member to an organization", async () => {
      const response = await request(app)
        .post(`/api/admin/organizations/${mutationOrgId}/members`)
        .set("Cookie", adminCookies)
        .send({ user_id: getUserUuid(2), role: "member" })
        .expect(201);

      expect(response.body.message).toBe("Member added successfully");
      expect(response.body.data.user_id).toBe(getUserUuid(2));
    });

    it("rejects a malformed user_id", async () => {
      await request(app)
        .post(`/api/admin/organizations/${mutationOrgId}/members`)
        .set("Cookie", adminCookies)
        .send({ user_id: "not-a-uuid" })
        .expect(400);
    });

    it("404s for an unknown organization", async () => {
      await request(app)
        .post(`/api/admin/organizations/${randomUUID()}/members`)
        .set("Cookie", adminCookies)
        .send({ user_id: getUserUuid(2), role: "member" })
        .expect(404);
    });
  });

  describe("PUT /api/admin/organizations/:organizationId/members/:userId", () => {
    beforeEach(ensureAliceIsMember);

    it("updates a member's role", async () => {
      const response = await request(app)
        .put(
          `/api/admin/organizations/${mutationOrgId}/members/${getUserUuid(2)}`,
        )
        .set("Cookie", adminCookies)
        .send({ role: "admin" })
        .expect(200);

      expect(response.body.data.role).toBe("admin");
    });

    it("rejects an unknown role", async () => {
      await request(app)
        .put(
          `/api/admin/organizations/${mutationOrgId}/members/${getUserUuid(2)}`,
        )
        .set("Cookie", adminCookies)
        .send({ role: "supreme-leader" })
        .expect(400);
    });

    it("404s for an unknown organization", async () => {
      await request(app)
        .put(
          `/api/admin/organizations/${randomUUID()}/members/${getUserUuid(2)}`,
        )
        .set("Cookie", adminCookies)
        .send({ role: "member" })
        .expect(404);
    });
  });

  describe("DELETE /api/admin/organizations/:organizationId/members/:userId", () => {
    beforeEach(ensureAliceIsMember);

    it("removes a member from an organization", async () => {
      await removeAlice().expect(200);

      const members = await request(app)
        .get(`/api/admin/organizations/${mutationOrgId}/members`)
        .set("Cookie", adminCookies)
        .expect(200);

      const memberIds = members.body.data.map((m: any) => m.user_id);
      expect(memberIds).not.toContain(getUserUuid(2));
    });

    it("404s for an unknown organization", async () => {
      await request(app)
        .delete(
          `/api/admin/organizations/${randomUUID()}/members/${getUserUuid(3)}`,
        )
        .set("Cookie", adminCookies)
        .expect(404);
    });
  });
});
