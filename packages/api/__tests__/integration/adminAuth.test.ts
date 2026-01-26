import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testAdmins } from "../../src/database/test-data";

require("dotenv").config({ quiet: true });

describe("Admin Authentication Integration Tests", () => {
  beforeAll(async () => {
    await seed({
      adminsData: testAdmins,
    });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/admin/auth/login", () => {
    it("should successfully login with valid credentials", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "Password1", // Matches the hash in test data
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Admin logged in successfully");
      expect(response.body.data).toHaveProperty("admin_id");
      expect(response.body.data.email).toBe("root.admin@test.com");
      expect(response.body.data.root).toBe(true);
      expect(response.body.data.is_active).toBe(true);
      expect(response.body.data).not.toHaveProperty("password_hash");

      // Check cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(
        cookieArray.some((cookie: string) => cookie.includes("access_token")),
      ).toBe(true);
      expect(
        cookieArray.some((cookie: string) => cookie.includes("refresh_token")),
      ).toBe(true);
    });

    it("should successfully login regular admin", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "regular.admin@test.com",
          password: "Password1",
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("regular.admin@test.com");
      expect(response.body.data.root).toBe(false);
      expect(response.body.data.is_active).toBe(true);
    });

    it("should reject login with incorrect password", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "WrongPassword",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should reject login with non-existent email", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "nonexistent@test.com",
          password: "Password1",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should reject login for deactivated admin", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "deactivated.admin@test.com",
          password: "Password1",
        })
        .expect(403);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Account is deactivated");
    });

    it("should allow login for unverified email admin", async () => {
      // Email verification is not required for login
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "unverified.admin@test.com",
          password: "Password1",
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email_verified).toBe(false);
    });

    it("should reject login with missing email", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject login with missing password", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject login with invalid email format", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "not-an-email",
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject login with empty password", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should handle recently deactivated admin", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "recently.deactivated@test.com",
          password: "Password1",
        })
        .expect(403);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Account is deactivated");
    });
  });

  describe("JWT Token Validation", () => {
    it("should return valid JWT tokens with correct payload", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      // Extract access token from cookie
      const accessTokenCookie = cookieArray.find((cookie: string) =>
        cookie.includes("access_token"),
      );
      expect(accessTokenCookie).toBeDefined();

      // Parse the token value
      const accessTokenMatch = accessTokenCookie?.match(/access_token=([^;]+)/);
      expect(accessTokenMatch).toBeDefined();
      const accessToken = accessTokenMatch![1];

      // Verify access token
      const accessKey = process.env.ADMIN_ACCESS_KEY;
      expect(accessKey).toBeDefined();

      const decodedAccess: any = jwt.verify(accessToken, accessKey!);
      expect(decodedAccess).toHaveProperty("role_id");
      expect(decodedAccess).toHaveProperty("role_type");
      expect(decodedAccess.role_type).toBe("admin");
      expect(decodedAccess.root).toBe(true);
      expect(decodedAccess).toHaveProperty("iat");
      expect(decodedAccess).toHaveProperty("exp");

      // Check token expiration is correct (15 minutes)
      const expiresIn = decodedAccess.exp - decodedAccess.iat;
      expect(expiresIn).toBe(15 * 60); // 15 minutes in seconds

      // Extract refresh token from cookie
      const refreshTokenCookie = cookieArray.find((cookie: string) =>
        cookie.includes("refresh_token"),
      );
      expect(refreshTokenCookie).toBeDefined();

      const refreshTokenMatch = refreshTokenCookie?.match(
        /refresh_token=([^;]+)/,
      );
      expect(refreshTokenMatch).toBeDefined();
      const refreshToken = refreshTokenMatch![1];

      // Verify refresh token
      const refreshKey = process.env.REFRESH_KEY;
      expect(refreshKey).toBeDefined();

      const decodedRefresh: any = jwt.verify(refreshToken, refreshKey!);
      expect(decodedRefresh).toHaveProperty("role_id");
      expect(decodedRefresh).toHaveProperty("role_type");
      expect(decodedRefresh.role_type).toBe("admin");
      expect(decodedRefresh).toHaveProperty("iat");
      expect(decodedRefresh).toHaveProperty("exp");

      // Check refresh token expiration is correct (7 days)
      const refreshExpiresIn = decodedRefresh.exp - decodedRefresh.iat;
      expect(refreshExpiresIn).toBe(7 * 24 * 60 * 60); // 7 days in seconds
    });

    it("should set root=false for regular admin tokens", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "regular.admin@test.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      const accessTokenCookie = cookieArray.find((cookie: string) =>
        cookie.includes("access_token"),
      );
      const accessTokenMatch = accessTokenCookie?.match(/access_token=([^;]+)/);
      const accessToken = accessTokenMatch![1];

      const accessKey = process.env.ADMIN_ACCESS_KEY;
      const decodedAccess: any = jwt.verify(accessToken, accessKey!);

      expect(decodedAccess.root).toBe(false);
    });

    it("should have matching role_id in both access and refresh tokens", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      const accessTokenCookie = cookieArray.find((cookie: string) =>
        cookie.includes("access_token"),
      );
      const accessTokenMatch = accessTokenCookie?.match(/access_token=([^;]+)/);
      const accessToken = accessTokenMatch![1];

      const refreshTokenCookie = cookieArray.find((cookie: string) =>
        cookie.includes("refresh_token"),
      );
      const refreshTokenMatch = refreshTokenCookie?.match(
        /refresh_token=([^;]+)/,
      );
      const refreshToken = refreshTokenMatch![1];

      const accessKey = process.env.ADMIN_ACCESS_KEY;
      const refreshKey = process.env.REFRESH_KEY;

      const decodedAccess: any = jwt.verify(accessToken, accessKey!);
      const decodedRefresh: any = jwt.verify(refreshToken, refreshKey!);

      expect(decodedAccess.role_id).toBe(decodedRefresh.role_id);
      expect(decodedAccess.role_id).toBe(response.body.data.admin_id);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed request body", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: 123, // Invalid type
          password: null,
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should handle extra fields in request body", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "Password1",
          extraField: "should be ignored",
          anotherField: 123,
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data).not.toHaveProperty("extraField");
    });

    it("should handle SQL injection attempts", async () => {
      // SQL injection in email is caught by Zod email validation
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com' OR '1'='1",
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should handle very long email strings", async () => {
      const longEmail = "a".repeat(1000) + "@test.com";
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: longEmail,
          password: "Password1",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should handle very long password strings", async () => {
      const longPassword = "a".repeat(10000);
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: longPassword,
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should handle special characters in password", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "!@#$%^&*()_+-=[]{}|;':\",./<>?",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should handle unicode characters in email", async () => {
      // Zod email validator rejects unicode domains (conservative approach)
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@тест.com",
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should handle empty JSON object", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({})
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should handle null values", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: null,
          password: null,
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });
  });

  describe("Security", () => {
    it("should not expose password hash in any response", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "Password1",
        })
        .expect(200);

      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toContain("password");
      expect(responseString).not.toContain("hash");
      expect(responseString).not.toContain("$2b$");
    });

    it("should not leak information about which field is incorrect", async () => {
      const wrongEmail = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "nonexistent@test.com",
          password: "Password1",
        })
        .expect(401);

      const wrongPassword = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "WrongPassword",
        })
        .expect(401);

      // Both should return the same generic message
      expect(wrongEmail.body.message).toBe(wrongPassword.body.message);
      expect(wrongEmail.body.message).toBe("Invalid credentials");
    });

    it("should set HttpOnly cookie flags", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({
          email: "root.admin@test.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      cookieArray.forEach((cookie: string) => {
        if (
          cookie.includes("access_token") ||
          cookie.includes("refresh_token")
        ) {
          expect(cookie.toLowerCase()).toContain("httponly");
        }
      });
    });
  });

  // describe("Database Connection", () => {
  //   // This test MUST be last as it closes the database connection
  //   it("should handle database connection errors gracefully", async () => {
  //     // Close the database connection to simulate error
  //     await db.end();

  //     const response = await request(app)
  //       .post("/api/admin/auth/login")
  //       .send({
  //         email: "root.admin@test.com",
  //         password: "Password1",
  //       })
  //       .expect(500);

  //     expect(response.body.status).toBe("error");
  //     expect(response.body.message).toBeDefined();

  //     // Don't reconnect - this is the last test in the suite
  //   });
  // });
});
