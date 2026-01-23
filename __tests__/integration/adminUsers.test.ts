import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testAdmins, testUsers } from "../../src/database/test-data";

require("dotenv").config({ quiet: true });

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
    it("should create a new user with valid data", async () => {
      const newUser = {
        email: "newuser@test.com",
        password: "TestPassword123",
        email_verified: false,
        is_active: true,
      };

      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send(newUser)
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("User created successfully");
      expect(response.body.data).toHaveProperty("user_id");
      expect(response.body.data.email).toBe(newUser.email);
      expect(response.body.data.is_active).toBe(newUser.is_active);
      expect(response.body.data).not.toHaveProperty("password");
      expect(response.body.data).not.toHaveProperty("password_hash");
    });

    it("should create a user with minimal required fields", async () => {
      const newUser = {
        email: "minimal@test.com",
        password: "Password1",
      };

      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send(newUser)
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe(newUser.email);
      expect(response.body.data.email_verified).toBe(false); // default
      expect(response.body.data.is_active).toBe(true); // default
    });

    it("should reject duplicate email", async () => {
      const duplicateUser = {
        email: testUsers[0].email,
        password: "Password1",
      };

      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send(duplicateUser)
        .expect(409);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Email already exists");
    });

    it("should reject missing password", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "nopassword@test.com",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Password is required");
    });

    it("should reject invalid email format", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "not-an-email",
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject empty password", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "emptypass@test.com",
          password: "",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject request without authentication", async () => {
      const response = await request(app)
        .post("/api/admin/users")
        .send({
          email: "noauth@test.com",
          password: "Password1",
        })
        .expect(401);

      expect(response.body.msg).toBe("Credentials missing");
    });

    it("should hash the password before storing", async () => {
      const newUser = {
        email: "hashtest@test.com",
        password: "TestPassword123",
      };

      const response = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send(newUser)
        .expect(201);

      // Password should not be in response
      expect(response.body.data).not.toHaveProperty("password");
      expect(response.body.data).not.toHaveProperty("password_hash");

      // Verify in database that password is hashed
      const dbUser = await db.query(
        "SELECT password_hash FROM users WHERE email = $1",
        [newUser.email]
      );
      expect(dbUser.rows[0].password_hash).toBeDefined();
      expect(dbUser.rows[0].password_hash).not.toBe(newUser.password);
      expect(dbUser.rows[0].password_hash).toMatch(/^\$2[aby]\$/); // bcrypt format
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
      const createResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "updatetest@test.com",
          password: "Password1",
        });

      const userId = createResponse.body.data.user_id;

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

    it("should update user password", async () => {
      // Create a user first
      const createResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "passwordupdate@test.com",
          password: "OldPassword123",
        });

      const userId = createResponse.body.data.user_id;

      const response = await request(app)
        .put(`/api/admin/users/reset-password/${userId}`)
        .set("Cookie", adminCookies)
        .send({
          password: "NewPassword456",
        });
      expect(response.body.status).toBe("success");
      expect(response.body.data).not.toHaveProperty("password");
      expect(response.body.data).not.toHaveProperty("password_hash");
    });

    it("should update is_active status", async () => {
      // Create a user first
      const createResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "activetest@test.com",
          password: "Password1",
        });

      const userId = createResponse.body.data.user_id;

      const response = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Cookie", adminCookies)
        .send({
          is_active: false,
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.is_active).toBe(false);
    });

    it("should update multiple fields at once", async () => {
      // Create a user first
      const createResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "multiupdate@test.com",
          password: "Password1",
        });

      const userId = createResponse.body.data.user_id;

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
      // Create two users
      const user1 = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "duplicate1@test.com",
          password: "Password1",
        });

      await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "duplicate2@test.com",
          password: "Password1",
        });

      // Try to update user1 to have user2's email
      const response = await request(app)
        .put(`/api/admin/users/${user1.body.data.user_id}`)
        .set("Cookie", adminCookies)
        .send({
          email: "duplicate2@test.com",
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
      // Create a user first
      const createResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "deletetest@test.com",
          password: "Password1",
        });

      const userId = createResponse.body.data.user_id;

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
        (u: any) => u.user_id === userId
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
      // Create and delete a user
      const createResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "doubledelete@test.com",
          password: "Password1",
        });

      const userId = createResponse.body.data.user_id;

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

  describe("Security", () => {
    it("should never expose password_hash in any response", async () => {
      const createResponse = await request(app)
        .post("/api/admin/users")
        .set("Cookie", adminCookies)
        .send({
          email: "securitytest@test.com",
          password: "TestPassword123",
        });

      const userId = createResponse.body.data.user_id;

      // Check create response
      expect(JSON.stringify(createResponse.body)).not.toContain(
        "password_hash"
      );
      expect(JSON.stringify(createResponse.body)).not.toContain("$2b$");

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
