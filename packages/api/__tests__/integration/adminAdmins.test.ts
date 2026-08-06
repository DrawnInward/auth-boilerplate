import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testAdmins } from "../../src/database/test-data";
import { TEST_UUIDS } from "../../src/database/test-data/testUuids";
import { loginAsAdmin } from "../helpers/loginAs";
import { createInvitation } from "../../src/models/invitations.models";

require("dotenv").config({ quiet: true });

// D3 admin-management slice: list / invite / disable platform admins, with
// root-only gating on the mutating routes and the last-admin protection.
// Wrong-role (user cookie) and unauthenticated rejections for these routes are
// also asserted by roleBoundary.test.ts.

describe("Admin management (D3)", () => {
  let rootCookies: string;
  let regularCookies: string;

  const getInvitationByEmail = async (email: string) => {
    const result = await db.query(
      `SELECT * FROM invitations
       WHERE email = $1 AND type = 'admin_registration'
       ORDER BY created_at DESC`,
      [email],
    );
    return result.rows;
  };

  beforeAll(async () => {
    await seed({ adminsData: testAdmins });
    rootCookies = await loginAsAdmin("root.admin@test.com");
    regularCookies = await loginAsAdmin("regular.admin@test.com");
  });

  afterAll(async () => {
    await db.end();
  });

  describe("GET /api/admin/admins", () => {
    it("lists admins for any admin, without secret material", async () => {
      const response = await request(app)
        .get("/api/admin/admins")
        .set("Cookie", regularCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      const emails = response.body.data.map((a: any) => a.email);
      expect(emails).toEqual(
        expect.arrayContaining([
          "root.admin@test.com",
          "regular.admin@test.com",
        ]),
      );
      for (const admin of response.body.data) {
        expect(admin).not.toHaveProperty("password_hash");
        expect(admin).not.toHaveProperty("mfa_secret");
      }
    });

    it("filters by root", async () => {
      const response = await request(app)
        .get("/api/admin/admins?root=true")
        .set("Cookie", rootCookies)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].email).toBe("root.admin@test.com");
    });

    it("filters by is_active", async () => {
      const response = await request(app)
        .get("/api/admin/admins?is_active=false")
        .set("Cookie", rootCookies)
        .expect(200);

      const emails = response.body.data.map((a: any) => a.email);
      expect(emails).toEqual(
        expect.arrayContaining([
          "deactivated.admin@test.com",
          "recently.deactivated@test.com",
        ]),
      );
      expect(emails).not.toContain("root.admin@test.com");
    });

    it("rejects a malformed query value", async () => {
      await request(app)
        .get("/api/admin/admins?root=maybe")
        .set("Cookie", rootCookies)
        .expect(400);
    });

    it("rejects request without authentication", async () => {
      const response = await request(app).get("/api/admin/admins").expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });
  });

  describe("POST /api/admin/admins", () => {
    it("root invites a new admin and an invitation is recorded", async () => {
      const response = await request(app)
        .post("/api/admin/admins")
        .set("Cookie", rootCookies)
        .send({ email: "new.admin@test.com" })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Invitation sent successfully");
      expect(response.body.data.email).toBe("new.admin@test.com");
      expect(response.body.data).toHaveProperty("expires_at");

      const invitations = await getInvitationByEmail("new.admin@test.com");
      expect(invitations).toHaveLength(1);
      expect(invitations[0].used_at).toBeNull();
    });

    it("re-inviting invalidates the previous pending invitation", async () => {
      await request(app)
        .post("/api/admin/admins")
        .set("Cookie", rootCookies)
        .send({ email: "new.admin@test.com" })
        .expect(201);

      const invitations = await getInvitationByEmail("new.admin@test.com");
      expect(invitations).toHaveLength(2);
      const pending = invitations.filter((i) => i.used_at === null);
      expect(pending).toHaveLength(1);
    });

    it("rejects a non-root admin", async () => {
      const response = await request(app)
        .post("/api/admin/admins")
        .set("Cookie", regularCookies)
        .send({ email: "sneaky.admin@test.com" })
        .expect(403);

      expect(response.body.message).toBe("Root admin required");
      expect(await getInvitationByEmail("sneaky.admin@test.com")).toHaveLength(
        0,
      );
    });

    it("rejects an email that already belongs to an admin", async () => {
      const response = await request(app)
        .post("/api/admin/admins")
        .set("Cookie", rootCookies)
        .send({ email: "regular.admin@test.com" })
        .expect(409);

      expect(response.body.message).toBe("Email already exists");
    });

    it("rejects a duplicate email regardless of case", async () => {
      const response = await request(app)
        .post("/api/admin/admins")
        .set("Cookie", rootCookies)
        .send({ email: "Regular.Admin@TEST.com" })
        .expect(409);

      expect(response.body.message).toBe("Email already exists");
      expect(await getInvitationByEmail("regular.admin@test.com")).toHaveLength(
        0,
      );
    });

    it("rejects an invalid email", async () => {
      await request(app)
        .post("/api/admin/admins")
        .set("Cookie", rootCookies)
        .send({ email: "not-an-email" })
        .expect(400);
    });

    it("rejects request without authentication", async () => {
      const response = await request(app)
        .post("/api/admin/admins")
        .send({ email: "noauth.admin@test.com" })
        .expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });
  });

  describe("POST /api/admin/auth/complete-registration", () => {
    it("creates a non-root admin and logs it in", async () => {
      const { token } = await createInvitation({
        email: "invited.admin@test.com",
        type: "admin_registration",
      });

      const response = await request(app)
        .post("/api/admin/auth/complete-registration")
        .send({ token, password: "SecurePassword123" })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("invited.admin@test.com");
      expect(response.body.data.root).toBe(false);
      expect(response.body.data.email_verified).toBe(true);
      expect(response.body.data.is_active).toBe(true);
      expect(response.body.data).not.toHaveProperty("password_hash");

      // The new admin has a live session and a working password.
      const cookies = response.headers["set-cookie"] as unknown as string;
      const me = await request(app)
        .get("/api/admin/auth/me")
        .set("Cookie", cookies)
        .expect(200);
      expect(me.body.data.email).toBe("invited.admin@test.com");

      await loginAsAdmin("invited.admin@test.com", "SecurePassword123");
    });

    it("rejects an invalid token", async () => {
      await request(app)
        .post("/api/admin/auth/complete-registration")
        .send({ token: "invalid-token-xyz", password: "SecurePassword123" })
        .expect(404);
    });

    it("rejects a token of another invitation type", async () => {
      const { token } = await createInvitation({
        email: "usertoken.admin@test.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/admin/auth/complete-registration")
        .send({ token, password: "SecurePassword123" })
        .expect(400);

      expect(response.body.message).toBe("Invalid invitation type");
    });

    it("rejects a used token", async () => {
      const { token } = await createInvitation({
        email: "once.admin@test.com",
        type: "admin_registration",
      });

      await request(app)
        .post("/api/admin/auth/complete-registration")
        .send({ token, password: "SecurePassword123" })
        .expect(201);

      const response = await request(app)
        .post("/api/admin/auth/complete-registration")
        .send({ token, password: "SecurePassword123" })
        .expect(400);

      expect(response.body.message).toBe("Invitation has already been used");
    });

    it("rejects a short password", async () => {
      const { token } = await createInvitation({
        email: "shortpw.admin@test.com",
        type: "admin_registration",
      });

      await request(app)
        .post("/api/admin/auth/complete-registration")
        .send({ token, password: "short" })
        .expect(400);
    });
  });

  describe("POST /api/admin/admins/:adminId/disable", () => {
    it("rejects a non-root admin", async () => {
      const response = await request(app)
        .post(`/api/admin/admins/${TEST_UUIDS.ADMINS.UNVERIFIED_ADMIN}/disable`)
        .set("Cookie", regularCookies)
        .expect(403);

      expect(response.body.message).toBe("Root admin required");
    });

    it("refuses to deactivate the root admin (last-admin protection)", async () => {
      const response = await request(app)
        .post(`/api/admin/admins/${TEST_UUIDS.ADMINS.ROOT_ADMIN}/disable`)
        .set("Cookie", rootCookies)
        .expect(409);

      expect(response.body.message).toBe(
        "Cannot deactivate the only active root admin",
      );
    });

    it("returns 409 for an already-deactivated admin", async () => {
      const response = await request(app)
        .post(
          `/api/admin/admins/${TEST_UUIDS.ADMINS.DEACTIVATED_ADMIN}/disable`,
        )
        .set("Cookie", rootCookies)
        .expect(409);

      expect(response.body.message).toBe("Admin is already deactivated");
    });

    it("returns 404 for an unknown admin", async () => {
      await request(app)
        .post("/api/admin/admins/00000000-0000-0000-0000-000000000000/disable")
        .set("Cookie", rootCookies)
        .expect(404);
    });

    it("rejects an invalid UUID", async () => {
      await request(app)
        .post("/api/admin/admins/not-a-uuid/disable")
        .set("Cookie", rootCookies)
        .expect(400);
    });

    it("rejects request without authentication", async () => {
      const response = await request(app)
        .post(`/api/admin/admins/${TEST_UUIDS.ADMINS.UNVERIFIED_ADMIN}/disable`)
        .expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });

    it("root deactivates an admin and ends their sessions (S4)", async () => {
      const targetId = TEST_UUIDS.ADMINS.UNVERIFIED_ADMIN;
      const targetCookies = await loginAsAdmin("unverified.admin@test.com");

      const response = await request(app)
        .post(`/api/admin/admins/${targetId}/disable`)
        .set("Cookie", rootCookies)
        .expect(200);

      expect(response.body.data.is_active).toBe(false);
      expect(response.body.data).not.toHaveProperty("password_hash");

      const row = await db.query(
        "SELECT is_active, deactivated_at, deactivated_by FROM admins WHERE admin_id = $1",
        [targetId],
      );
      expect(row.rows[0].is_active).toBe(false);
      expect(row.rows[0].deactivated_at).not.toBeNull();
      expect(row.rows[0].deactivated_by).toBe(TEST_UUIDS.ADMINS.ROOT_ADMIN);

      // The pre-disable refresh token can no longer mint a session.
      const cookieArray = Array.isArray(targetCookies)
        ? targetCookies
        : [targetCookies];
      const refreshOnly = cookieArray
        .flat()
        .filter((c: string) => c.startsWith("refresh_token="));
      const refresh = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", refreshOnly)
        .expect(401);
      expect(refresh.body.message).toBe("Refresh token has been revoked");
    });
  });
});
