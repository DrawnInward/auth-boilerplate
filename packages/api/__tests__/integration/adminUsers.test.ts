import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testAdmins, testUsers } from "../../src/database/test-data";
import { createUser } from "../../src/models/users.models";

require("dotenv").config({ quiet: true });

const getInvitationToken = async (email: string): Promise<string | null> => {
  const result = await db.query(
    `SELECT token_hash FROM invitations
     WHERE email = $1 AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase()],
  );
  return result.rows[0]?.token_hash || null;
};

const getInvitationByEmail = async (
  email: string,
  type?: string,
): Promise<any> => {
  let query = `SELECT * FROM invitations WHERE email = $1 AND used_at IS NULL`;
  const values: any[] = [email.toLowerCase()];
  if (type) {
    query += ` AND type = $2`;
    values.push(type);
  }
  query += ` ORDER BY created_at DESC LIMIT 1`;
  const result = await db.query(query, values);
  return result.rows[0] || null;
};

describe("Admin User Management Integration Tests", () => {
  let adminAccessToken: string;
  let adminCookies: string[];

  beforeAll(async () => {
    await seed({
      adminsData: testAdmins,
      usersData: testUsers,
    });

    // Login as root admin to get auth tokens
    const loginResponse = await request(app)
      .post("/api/admin/auth/login")
      .send({
        email: "root.admin@test.com",
        password: "Password1",
      });

    adminCookies = loginResponse.headers["set-cookie"] as any;
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/admin/users", () => {
    it("should create an invitation for a new user", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: "newuser@test.com" })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Invitation sent successfully");
      expect(response.body.data.email).toBe("newuser@test.com");
      expect(response.body.data).toHaveProperty("expires_at");

      // Verify invitation was created in database
      const invitation = await getInvitationByEmail(
        "newuser@test.com",
        "admin_invite",
      );
      expect(invitation).not.toBeNull();
      expect(invitation.type).toBe("admin_invite");
    });

    it("should reject duplicate email for existing user", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: testUsers[0].email })
        .expect(409);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Email already exists");
    });

    it("should invalidate previous pending invitations", async () => {
      // Create first invitation
      await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: "duplicate-invite@test.com" })
        .expect(201);

      const firstInvitation = await getInvitationByEmail(
        "duplicate-invite@test.com",
        "admin_invite",
      );
      expect(firstInvitation).not.toBeNull();

      // Create second invitation for same email
      await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: "duplicate-invite@test.com" })
        .expect(201);

      // Check first invitation was marked as used
      const firstInviteAfter = await db.query(
        "SELECT * FROM invitations WHERE id = $1",
        [firstInvitation.id],
      );
      expect(firstInviteAfter.rows[0].used_at).not.toBeNull();
    });

    it("should reject invalid email format", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: "not-an-email" })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject request without authentication", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .send({ email: "noauth@test.com" })
        .expect(401);

      expect(response.body.msg).toBe("Credentials missing");
    });
  });

  describe("GET /api/admin/users", () => {
    it("should retrieve all users", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Users retrieved successfully");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check user structure
      response.body.data.forEach((user: any) => {
        expect(user).toHaveProperty("user_id");
        expect(user).toHaveProperty("email");
        expect(user).toHaveProperty("is_active");
        expect(user).not.toHaveProperty("password_hash");
      });
    });

    it("should filter by is_active", async () => {
      const response = await request(app)
        .get("/api/admin/users?is_active=true")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      response.body.data.forEach((user: any) => {
        expect(user.is_active).toBe(true);
      });
    });

    it("should filter by email_verified", async () => {
      const response = await request(app)
        .get("/api/admin/users?email_verified=true")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      response.body.data.forEach((user: any) => {
        expect(user.email_verified).toBe(true);
      });
    });

    it("should support pagination with limit", async () => {
      const response = await request(app)
        .get("/api/admin/users?limit=2")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it("should support pagination with offset", async () => {
      const page1 = await request(app)
        .get("/api/admin/users?limit=2&offset=0")
        .set("Cookie", adminCookies)
        .expect(200);

      const page2 = await request(app)
        .get("/api/admin/users?limit=2&offset=2")
        .set("Cookie", adminCookies)
        .expect(200);

      // Ensure different users on different pages
      if (page1.body.data.length > 0 && page2.body.data.length > 0) {
        expect(page1.body.data[0].user_id).not.toBe(page2.body.data[0].user_id);
      }
    });

    it("should reject request without authentication", async () => {
      const response = await request(app).get("/api/admin/users").expect(401);

      expect(response.body.msg).toBe("Credentials missing");
    });
  });

  describe("GET /api/admin/users/:userId", () => {
    it("should retrieve a specific user by ID", async () => {
      // Get all users first to get a valid ID
      const allUsers = await request(app)
        .get("/api/admin/users")
        .set("Cookie", adminCookies);

      const userId = allUsers.body.data[0].user_id;

      const response = await request(app)
        .get(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("User retrieved successfully");
      expect(response.body.data.user_id).toBe(userId);
      expect(response.body.data).toHaveProperty("email");
      expect(response.body.data).not.toHaveProperty("password_hash");
    });

    it("should return 404 for non-existent user ID", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const response = await request(app)
        .get(`/api/admin/users/${fakeUuid}`)
        .set("Cookie", adminCookies)
        .expect(404);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("User not found");
    });

    it("should reject invalid UUID format", async () => {
      const response = await request(app)
        .get("/api/admin/users/not-a-uuid")
        .set("Cookie", adminCookies)
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject request without authentication", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const response = await request(app)
        .get(`/api/admin/users/${fakeUuid}`)
        .expect(401);

      expect(response.body.msg).toBe("Credentials missing");
    });
  });

  describe("PUT /api/admin/users/:userId", () => {
    it("should update user email", async () => {
      // Create a user first
      const createResponse = await createUser({
        email: "updatetest@test.com",
        password_hash:
          "$2b$10$UOmUkN/DnL0BN0NX2.YXKeaKXCbmWSN0vWN0dD.bcDcbYPJiqI.Pm", // Hash of Password1,
        email_verified: true,
        is_active: true,
        created_through: "admin_created",
      });

      const userId = createResponse.user_id;

      const response = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .send({
          email: "updated@test.com",
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("User updated successfully");
      expect(response.body.data.email).toBe("updated@test.com");
    });

    it("should send password reset email", async () => {
      // Use an existing test user
      const userId = testUsers[0].user_id;

      const response = await request(app)
        .post(`/api/admin/users/reset-password/${userId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Password reset email sent");
      expect(response.body.data).toHaveProperty("email");

      // Verify password reset invitation was created
      const invitation = await getInvitationByEmail(
        testUsers[0].email,
        "password_reset",
      );
      expect(invitation).not.toBeNull();
      expect(invitation.type).toBe("password_reset");
    });

    it("should update is_active status", async () => {
      const userId = testUsers[1].user_id;

      const response = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .send({
          is_active: false,
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.is_active).toBe(false);

      // Reset for other tests
      await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .send({ is_active: true });
    });

    it("should update multiple fields at once", async () => {
      // Create a user directly in database for this test
      const result = await db.query(
        `INSERT INTO users (email, password_hash, email_verified, is_active)
         VALUES ($1, $2, $3, $4) RETURNING user_id`,
        ["multiupdate@test.com", "$2b$10$test", false, true],
      );
      const userId = result.rows[0].user_id;

      const response = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .send({
          email: "multiunew@test.com",
          is_active: false,
          email_verified: true,
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("multiunew@test.com");
      expect(response.body.data.is_active).toBe(false);
      expect(response.body.data.email_verified).toBe(true);
    });

    it("should return 404 for non-existent user", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const response = await request(app)
        .put(`/api/admin/users/${fakeUuid}`)
        .set("Cookie", adminCookies)
        .send({
          email: "notfound@test.com",
        })
        .expect(404);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("User not found");
    });

    it("should reject duplicate email", async () => {
      // Use existing test users
      const userId = testUsers[1].user_id;

      // Try to update user to have another user's email
      const response = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .send({
          email: testUsers[0].email,
        })
        .expect(409);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Email already exists");
    });

    it("should reject invalid email format", async () => {
      const allUsers = await request(app)
        .get("/api/admin/users")
        .set("Cookie", adminCookies);

      const userId = allUsers.body.data[0].user_id;

      const response = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .send({
          email: "not-an-email",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject request without authentication", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const response = await request(app)
        .put(`/api/admin/users/${fakeUuid}`)
        .send({
          email: "noauth@test.com",
        })
        .expect(401);

      expect(response.body.msg).toBe("Credentials missing");
    });
  });

  describe("DELETE /api/admin/users/:userId", () => {
    it("should soft delete a user", async () => {
      // Create a user directly in database
      const result = await db.query(
        `INSERT INTO users (email, password_hash, email_verified, is_active)
         VALUES ($1, $2, $3, $4) RETURNING user_id`,
        ["deletetest@test.com", "$2b$10$test", true, true],
      );
      const userId = result.rows[0].user_id;

      const response = await request(app)
        .delete(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("User deleted successfully");
      expect(response.body.data.user_id).toBe(userId);
      expect(response.body.data.deleted_at).toBeDefined();

      // Verify user is not returned in list
      const listResponse = await request(app)
        .get("/api/admin/users")
        .set("Cookie", adminCookies);

      const deletedUser = listResponse.body.data.find(
        (u: any) => u.user_id === userId,
      );
      expect(deletedUser).toBeUndefined();
    });

    it("should return 404 for non-existent user", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const response = await request(app)
        .delete(`/api/admin/users/${fakeUuid}`)
        .set("Cookie", adminCookies)
        .expect(404);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("User not found");
    });

    it("should reject deleting already deleted user", async () => {
      // Create a user directly in database
      const result = await db.query(
        `INSERT INTO users (email, password_hash, email_verified, is_active)
         VALUES ($1, $2, $3, $4) RETURNING user_id`,
        ["doubledelete@test.com", "$2b$10$test", true, true],
      );
      const userId = result.rows[0].user_id;

      await request(app)
        .delete(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      // Try to delete again
      const response = await request(app)
        .delete(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .expect(409);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("User already deleted");
    });

    it("should reject invalid UUID format", async () => {
      const response = await request(app)
        .delete("/api/admin/users/not-a-uuid")
        .set("Cookie", adminCookies)
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject request without authentication", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const response = await request(app)
        .delete(`/api/admin/users/${fakeUuid}`)
        .expect(401);

      expect(response.body.msg).toBe("Credentials missing");
    });
  });

  describe("Password Reset", () => {
    it("should return 404 for non-existent user", async () => {
      const fakeUuid = "00000000-0000-0000-0000-000000000000";
      const response = await request(app)
        .post(`/api/admin/users/reset-password/${fakeUuid}`)
        .set("Cookie", adminCookies)
        .expect(404);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("User not found");
    });

    it("should invalidate previous password reset invitations", async () => {
      const userId = testUsers[0].user_id;

      // Send first reset
      await request(app)
        .post(`/api/admin/users/reset-password/${userId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      const firstInvitation = await getInvitationByEmail(
        testUsers[0].email,
        "password_reset",
      );
      expect(firstInvitation).not.toBeNull();

      // Send second reset
      await request(app)
        .post(`/api/admin/users/reset-password/${userId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      // Check first invitation was marked as used
      const firstInviteAfter = await db.query(
        "SELECT * FROM invitations WHERE id = $1",
        [firstInvitation.id],
      );
      expect(firstInviteAfter.rows[0].used_at).not.toBeNull();
    });
  });

  describe("Security", () => {
    it("should never expose password_hash in any response", async () => {
      const userId = testUsers[0].user_id;

      // Check invite response (no password_hash expected in invitation)
      const inviteResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({ email: "securitytest@test.com" });

      expect(JSON.stringify(inviteResponse.body)).not.toContain(
        "password_hash",
      );
      expect(JSON.stringify(inviteResponse.body)).not.toContain("$2b$");

      // Check get response
      const getResponse = await request(app)
        .get(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies);

      expect(JSON.stringify(getResponse.body)).not.toContain("password_hash");
      expect(JSON.stringify(getResponse.body)).not.toContain("$2b$");

      // Check list response
      const listResponse = await request(app)
        .get("/api/admin/users")
        .set("Cookie", adminCookies);

      expect(JSON.stringify(listResponse.body)).not.toContain("password_hash");
      expect(JSON.stringify(listResponse.body)).not.toContain("$2b$");
    });
  });
});
