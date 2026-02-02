import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers, testAdmins } from "../../src/database/test-data";
import { getUserUuid } from "../../src/database/test-data/testUuids";

require("dotenv").config({ quiet: true });

describe("Organization Creation Modes", () => {
  let selfRegisteredCookies: string;
  let orgInvitedCookies: string;
  let adminCookies: string;

  const originalOrgMode = process.env.ORG_CREATION_MODE;

  beforeAll(async () => {
    const usersWithModes = [
      {
        ...testUsers[0],
        created_through: "self_registered" as const,
      },
      {
        ...testUsers[1],
        created_through: "org_invited" as const,
      },
      {
        ...testUsers[2],
        created_through: "admin_created" as const,
        is_active: true,
        email_verified: true,
      },
    ];

    await seed({
      usersData: usersWithModes,
      adminsData: testAdmins,
    });

    const selfRegLogin = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "Password1",
    });
    selfRegisteredCookies = selfRegLogin.headers["set-cookie"] as string;

    const orgInvitedLogin = await request(app).post("/api/auth/login").send({
      email: "alice@example.com",
      password: "Password1",
    });
    orgInvitedCookies = orgInvitedLogin.headers["set-cookie"] as string;

    const adminLogin = await request(app).post("/api/admin/auth/login").send({
      email: "root.admin@test.com",
      password: "Password1",
    });
    adminCookies = adminLogin.headers["set-cookie"] as string;
  });

  afterAll(async () => {
    process.env.ORG_CREATION_MODE = originalOrgMode;
    await db.end();
  });

  afterEach(() => {
    process.env.ORG_CREATION_MODE = originalOrgMode;
  });

  describe("ORG_CREATION_MODE=open", () => {
    beforeEach(() => {
      process.env.ORG_CREATION_MODE = "open";
    });

    it("should allow self-registered user to create org", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", selfRegisteredCookies)
        .send({ name: "Open Mode Org 1" })
        .expect(201);

      expect(response.body.status).toBe("success");
    });

    it("should allow org-invited user to create org", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", orgInvitedCookies)
        .send({ name: "Open Mode Org 2" })
        .expect(201);

      expect(response.body.status).toBe("success");
    });
  });

  describe("ORG_CREATION_MODE=self_registered_only", () => {
    beforeEach(() => {
      process.env.ORG_CREATION_MODE = "self_registered_only";
    });

    it("should allow self-registered user to create org", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", selfRegisteredCookies)
        .send({ name: "Self Reg Mode Org" })
        .expect(201);

      expect(response.body.status).toBe("success");
    });

    it("should reject org-invited user from creating org", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", orgInvitedCookies)
        .send({ name: "Should Fail Org" })
        .expect(403);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("self-registered");
    });
  });

  describe("ORG_CREATION_MODE=admin_only", () => {
    beforeEach(() => {
      process.env.ORG_CREATION_MODE = "admin_only";
    });

    it("should reject self-registered user from creating org", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", selfRegisteredCookies)
        .send({ name: "Should Fail Admin Only" })
        .expect(403);
      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("administrator");
    });

    it("should reject org-invited user from creating org", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", orgInvitedCookies)
        .send({ name: "Should Also Fail" })
        .expect(403);

      expect(response.body.status).toBe("error");
    });
  });

  describe("Admin can_create_orgs override", () => {
    it("should allow admin to grant org creation permission", async () => {
      process.env.ORG_CREATION_MODE = "admin_only";

      const response = await request(app)
        .patch(`/api/admin/users/${getUserUuid(2)}/org-permission`)
        .set("Cookie", adminCookies)
        .send({ can_create_orgs: true })
        .expect(200);

      expect(response.body.data.can_create_orgs).toBe(true);

      const orgResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", orgInvitedCookies)
        .send({ name: "Override Allowed Org" })
        .expect(201);

      expect(orgResponse.body.status).toBe("success");
    });

    it("should allow admin to revoke org creation permission", async () => {
      process.env.ORG_CREATION_MODE = "open";

      await request(app)
        .patch(`/api/admin/users/${getUserUuid(1)}/org-permission`)
        .set("Cookie", adminCookies)
        .send({ can_create_orgs: false })
        .expect(200);

      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", selfRegisteredCookies)
        .send({ name: "Override Revoked Org" })
        .expect(403);

      expect(response.body.status).toBe("error");
    });

    it("should allow admin to reset to default (null)", async () => {
      const response = await request(app)
        .patch(`/api/admin/users/${getUserUuid(1)}/org-permission`)
        .set("Cookie", adminCookies)
        .send({ can_create_orgs: null })
        .expect(200);

      expect(response.body.data.can_create_orgs).toBeNull();
    });
  });

  describe("GET /api/auth/me includes can_create_orgs", () => {
    it("should return computed can_create_orgs in profile", async () => {
      process.env.ORG_CREATION_MODE = "open";

      await request(app)
        .patch(`/api/admin/users/${getUserUuid(1)}/org-permission`)
        .set("Cookie", adminCookies)
        .send({ can_create_orgs: null });

      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", selfRegisteredCookies)
        .expect(200);

      expect(response.body.data).toHaveProperty("can_create_orgs");
      expect(response.body.data).toHaveProperty("created_through");
      expect(response.body.data.can_create_orgs).toBe(true);
      expect(response.body.data.created_through).toBe("self_registered");
    });

    it("should return false when mode is admin_only", async () => {
      process.env.ORG_CREATION_MODE = "admin_only";

      await request(app)
        .patch(`/api/admin/users/${getUserUuid(1)}/org-permission`)
        .set("Cookie", adminCookies)
        .send({ can_create_orgs: null });

      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", selfRegisteredCookies)
        .expect(200);

      expect(response.body.data.can_create_orgs).toBe(false);
    });
  });
});
