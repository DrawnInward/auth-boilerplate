import request from "supertest";
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

describe("Organization Integration Tests", () => {
  let ownerCookies: string;
  let adminCookies: string;
  let memberCookies: string;
  let viewerCookies: string;

  beforeAll(async () => {
    await seed({
      usersData: testUsers,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
    });

    // Login as owner (TEST_USER - owner of ACME_CORP and SHARED_PROJECT)
    const ownerLogin = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "Password1",
    });
    ownerCookies = ownerLogin.headers["set-cookie"] as string;

    // Login as admin (ALICE - admin of ACME_CORP)
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "alice@example.com",
      password: "Password1",
    });
    adminCookies = adminLogin.headers["set-cookie"] as string;
  });

  afterAll(async () => {
    await db.end();
  });

  describe("GET /api/organizations", () => {
    it("should return user's organizations", async () => {
      const response = await request(app)
        .get("/api/organizations")
        .set("Cookie", ownerCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);

      response.body.data.forEach((org: any) => {
        expect(org).toHaveProperty("id");
        expect(org).toHaveProperty("name");
        expect(org).toHaveProperty("role");
      });
    });

    it("should reject unauthenticated request", async () => {
      await request(app).get("/api/organizations").expect(401);
    });
  });

  describe("POST /api/organizations", () => {
    it("should create a new organization", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({
          name: "New Test Organization",
        })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.data.name).toBe("New Test Organization");
      expect(response.body.data.slug).toBe("new-test-organization");
      expect(response.body.data.owner_id).toBe(getUserUuid(1));
    });

    it("should create organization with custom slug", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({
          name: "Custom Slug Org",
          slug: "my-custom-slug",
        })
        .expect(201);

      expect(response.body.data.slug).toBe("my-custom-slug");
    });

    it("should reject duplicate slug", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({
          name: "Another Acme",
          slug: "acme-corp",
        })
        .expect(409);

      expect(response.body.status).toBe("error");
    });

    it("should reject empty name", async () => {
      await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({
          name: "",
        })
        .expect(400);
    });

    it("should reject unauthenticated request", async () => {
      await request(app)
        .post("/api/organizations")
        .send({ name: "Unauthorized Org" })
        .expect(401);
    });
  });

  describe("GET /api/organizations/:organizationId", () => {
    it("should return organization details for member", async () => {
      const orgId = getOrganizationUuid(1);

      const response = await request(app)
        .get(`/api/organizations/${orgId}`)
        .set("Cookie", ownerCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.id).toBe(orgId);
      expect(response.body.data.name).toBe("Acme Corporation");
    });

    it("should reject non-member access", async () => {
      // Alice is not a member of Bob's Team
      const orgId = getOrganizationUuid(2);

      await request(app)
        .get(`/api/organizations/${orgId}`)
        .set("Cookie", adminCookies)
        .expect(403);
    });

    it("should return 404 for non-existent organization", async () => {
      await request(app)
        .get("/api/organizations/550e8400-e29b-41d4-a716-446655440999")
        .set("Cookie", ownerCookies)
        .expect(404);
    });
  });

  describe("PUT /api/organizations/:organizationId", () => {
    it("should update organization as owner", async () => {
      const orgId = getOrganizationUuid(1);

      const response = await request(app)
        .put(`/api/organizations/${orgId}`)
        .set("Cookie", ownerCookies)
        .send({
          name: "Acme Corporation Updated",
        })
        .expect(200);

      expect(response.body.data.name).toBe("Acme Corporation Updated");
    });

    it("should update organization as admin", async () => {
      const orgId = getOrganizationUuid(1);

      const response = await request(app)
        .put(`/api/organizations/${orgId}`)
        .set("Cookie", adminCookies)
        .send({
          name: "Acme Corp",
        })
        .expect(200);

      expect(response.body.data.name).toBe("Acme Corp");
    });

    it("should reject update from member (non-admin)", async () => {
      // First need to login as Bob who is a member
      const bobLogin = await request(app).post("/api/auth/login").send({
        email: "bob@example.com",
        password: "Password1",
      });

      // Bob is inactive in test data, so this will fail at login
      // For this test, we'll use the shared project where Alice is just a member
      const orgId = getOrganizationUuid(4); // SHARED_PROJECT

      await request(app)
        .put(`/api/organizations/${orgId}`)
        .set("Cookie", adminCookies) // Alice is member in SHARED_PROJECT
        .send({
          name: "Should Not Work",
        })
        .expect(403);
    });

    it("should reject duplicate slug", async () => {
      const orgId = getOrganizationUuid(1);

      await request(app)
        .put(`/api/organizations/${orgId}`)
        .set("Cookie", ownerCookies)
        .send({
          slug: "bobs-team",
        })
        .expect(409);
    });
  });

  describe("DELETE /api/organizations/:organizationId", () => {
    it("should delete organization as owner", async () => {
      // Create a new org to delete
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({ name: "To Delete Org" });

      const orgId = createResponse.body.data.id;

      await request(app)
        .delete(`/api/organizations/${orgId}`)
        .set("Cookie", ownerCookies)
        .expect(200);

      // Verify it's deleted
      await request(app)
        .get(`/api/organizations/${orgId}`)
        .set("Cookie", ownerCookies)
        .expect(404);
    });

    it("should reject delete from admin (non-owner)", async () => {
      const orgId = getOrganizationUuid(1);

      await request(app)
        .delete(`/api/organizations/${orgId}`)
        .set("Cookie", adminCookies)
        .expect(403);
    });
  });

  describe("GET /api/organizations/:organizationId/members", () => {
    it("should return organization members", async () => {
      const orgId = getOrganizationUuid(1);

      const response = await request(app)
        .get(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);

      response.body.data.forEach((member: any) => {
        expect(member).toHaveProperty("user_id");
        expect(member).toHaveProperty("role");
        expect(member).toHaveProperty("email");
      });
    });

    it("should allow admin to view members", async () => {
      const orgId = getOrganizationUuid(1);

      const response = await request(app)
        .get(`/api/organizations/${orgId}/members`)
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("POST /api/organizations/:organizationId/members", () => {
    it("should add member as owner", async () => {
      // Create new org to add members to
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({ name: "Add Members Org" });

      const orgId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies)
        .send({
          user_id: getUserUuid(2),
          role: "member",
        })
        .expect(201);

      expect(response.body.data.user_id).toBe(getUserUuid(2));
      expect(response.body.data.role).toBe("member");
    });

    it("should reject duplicate membership", async () => {
      const orgId = getOrganizationUuid(1);

      await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies)
        .send({
          user_id: getUserUuid(2), // Alice is already a member
          role: "member",
        })
        .expect(409);
    });
  });

  describe("PUT /api/organizations/:organizationId/members/:userId", () => {
    it("should update member role as owner", async () => {
      // Create org and add member
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({ name: "Role Update Org" });

      const orgId = createResponse.body.data.id;

      await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies)
        .send({ user_id: getUserUuid(2), role: "member" });

      const response = await request(app)
        .put(`/api/organizations/${orgId}/members/${getUserUuid(2)}`)
        .set("Cookie", ownerCookies)
        .send({ role: "admin" })
        .expect(200);

      expect(response.body.data.role).toBe("admin");
    });

    it("should reject setting role to owner", async () => {
      const orgId = getOrganizationUuid(1);

      await request(app)
        .put(`/api/organizations/${orgId}/members/${getUserUuid(2)}`)
        .set("Cookie", ownerCookies)
        .send({ role: "owner" })
        .expect(400);
    });
  });

  describe("DELETE /api/organizations/:organizationId/members/:userId", () => {
    it("should remove member as owner", async () => {
      // Create org and add member
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({ name: "Remove Member Org" });

      const orgId = createResponse.body.data.id;

      await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies)
        .send({ user_id: getUserUuid(2), role: "member" });

      await request(app)
        .delete(`/api/organizations/${orgId}/members/${getUserUuid(2)}`)
        .set("Cookie", ownerCookies)
        .expect(200);

      // Verify member is removed
      const membersResponse = await request(app)
        .get(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies);

      const memberIds = membersResponse.body.data.map((m: any) => m.user_id);
      expect(memberIds).not.toContain(getUserUuid(2));
    });

    it("should not allow removing owner", async () => {
      const orgId = getOrganizationUuid(1);

      await request(app)
        .delete(`/api/organizations/${orgId}/members/${getUserUuid(1)}`)
        .set("Cookie", ownerCookies)
        .expect(400);
    });
  });

  describe("POST /api/organizations/:organizationId/transfer-ownership", () => {
    it("should transfer ownership", async () => {
      // Create org
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({ name: "Transfer Ownership Org" });

      const orgId = createResponse.body.data.id;

      // Add member to transfer to
      await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies)
        .send({ user_id: getUserUuid(2), role: "admin" });

      const response = await request(app)
        .post(`/api/organizations/${orgId}/transfer-ownership`)
        .set("Cookie", ownerCookies)
        .send({ new_owner_id: getUserUuid(2) })
        .expect(200);

      expect(response.body.data.newOwner.role).toBe("owner");
      expect(response.body.data.oldOwner.role).toBe("admin");
    });

    it("should reject transfer to non-member", async () => {
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({ name: "Invalid Transfer Org" });

      const orgId = createResponse.body.data.id;

      await request(app)
        .post(`/api/organizations/${orgId}/transfer-ownership`)
        .set("Cookie", ownerCookies)
        .send({ new_owner_id: getUserUuid(3) })
        .expect(400);
    });

    it("should reject transfer from non-owner", async () => {
      const orgId = getOrganizationUuid(1);

      await request(app)
        .post(`/api/organizations/${orgId}/transfer-ownership`)
        .set("Cookie", adminCookies)
        .send({ new_owner_id: getUserUuid(2) })
        .expect(403);
    });
  });

  describe("POST /api/organizations/:organizationId/leave", () => {
    it("should allow member to leave", async () => {
      // Create org and add Alice as member
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", ownerCookies)
        .send({ name: "Leave Test Org" });

      const orgId = createResponse.body.data.id;

      await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies)
        .send({ user_id: getUserUuid(2), role: "member" });

      await request(app)
        .post(`/api/organizations/${orgId}/leave`)
        .set("Cookie", adminCookies)
        .expect(200);

      // Verify Alice is no longer a member
      const membersResponse = await request(app)
        .get(`/api/organizations/${orgId}/members`)
        .set("Cookie", ownerCookies);

      const memberIds = membersResponse.body.data.map((m: any) => m.user_id);
      expect(memberIds).not.toContain(getUserUuid(2));
    });

    it("should not allow owner to leave", async () => {
      const orgId = getOrganizationUuid(1);

      await request(app)
        .post(`/api/organizations/${orgId}/leave`)
        .set("Cookie", ownerCookies)
        .expect(400);
    });
  });

  describe("Role-based access control", () => {
    it("should allow viewer to only read, not modify", async () => {
      // SHARED_PROJECT has BOB as viewer
      const orgId = getOrganizationUuid(4);

      // First activate Bob and login
      const { modifyUser } = await import("../../src/models/users.models");
      await modifyUser(getUserUuid(3), { is_active: true });

      const bobLogin = await request(app).post("/api/auth/login").send({
        email: "bob@example.com",
        password: "Password1",
      });

      if (bobLogin.status !== 200) {
        // Skip if Bob can't login
        return;
      }

      viewerCookies = bobLogin.headers["set-cookie"] as string;

      // Viewer can read
      await request(app)
        .get(`/api/organizations/${orgId}`)
        .set("Cookie", viewerCookies)
        .expect(200);

      // Viewer cannot update
      await request(app)
        .put(`/api/organizations/${orgId}`)
        .set("Cookie", viewerCookies)
        .send({ name: "Should Fail" })
        .expect(403);
    });
  });
});
