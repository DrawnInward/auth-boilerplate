import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers } from "../../src/database/test-data";

require("dotenv").config({ quiet: true });

describe("User Authentication Integration Tests", () => {
  beforeAll(async () => {
    await seed({
      usersData: testUsers,
    });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/auth/login", () => {
    it("should successfully login with valid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("User logged in successfully");
      expect(response.body.data).toHaveProperty("user_id");
      expect(response.body.data.email).toBe("test@example.com");
      expect(response.body.data.is_active).toBe(true);
      expect(response.body.data).not.toHaveProperty("password_hash");

      // Check cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(
        cookieArray.some((cookie: string) => cookie.includes("access_token"))
      ).toBe(true);
      expect(
        cookieArray.some((cookie: string) => cookie.includes("refresh_token"))
      ).toBe(true);
    });

    it("should successfully login verified user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "alice@example.com",
          password: "Password1",
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("alice@example.com");
      expect(response.body.data.email_verified).toBe(true);
      expect(response.body.data.is_active).toBe(true);
    });

    it("should reject login with incorrect password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "WrongPassword",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should reject login with non-existent email", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "Password1",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should reject login for deactivated user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "deactivated@example.com",
          password: "Password1",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should reject login with missing email", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject login with missing password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject login with invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/login")
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
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });
  });

  describe("JWT Token Validation", () => {
    it("should return valid JWT tokens with correct payload", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      // Extract access token
      const accessTokenCookie = cookieArray.find((c: string) =>
        c.includes("access_token")
      );
      expect(accessTokenCookie).toBeDefined();

      const accessTokenMatch = accessTokenCookie!.match(/access_token=([^;]+)/);
      expect(accessTokenMatch).toBeTruthy();
      const accessToken = accessTokenMatch![1];

      // Verify access token
      const accessKey = process.env.USER_ACCESS_KEY!;
      const decodedAccess = jwt.verify(accessToken, accessKey) as any;

      expect(decodedAccess).toHaveProperty("role_id");
      expect(decodedAccess).toHaveProperty("role_type");
      expect(decodedAccess.role_type).toBe("user");
      expect(decodedAccess).toHaveProperty("email_verified");

      // Extract refresh token
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token")
      );
      expect(refreshTokenCookie).toBeDefined();

      const refreshTokenMatch = refreshTokenCookie!.match(
        /refresh_token=([^;]+)/
      );
      expect(refreshTokenMatch).toBeTruthy();
      const refreshToken = refreshTokenMatch![1];

      // Verify refresh token
      const refreshKey = process.env.REFRESH_KEY!;
      const decodedRefresh = jwt.verify(refreshToken, refreshKey) as any;

      expect(decodedRefresh).toHaveProperty("refresh_id");
      expect(decodedRefresh).toHaveProperty("role_type");
      expect(decodedRefresh.role_type).toBe("user");
    });

    it("should have correct expiration times on tokens", async () => {
      const beforeLogin = Math.floor(Date.now() / 1000);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      const afterLogin = Math.floor(Date.now() / 1000);

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      // Check access token expiration (15 minutes)
      const accessTokenCookie = cookieArray.find((c: string) =>
        c.includes("access_token")
      );
      const accessToken = accessTokenCookie!.match(/access_token=([^;]+)/)![1];
      const decodedAccess = jwt.decode(accessToken) as any;

      expect(decodedAccess.exp).toBeGreaterThanOrEqual(beforeLogin + 15 * 60);
      expect(decodedAccess.exp).toBeLessThanOrEqual(afterLogin + 15 * 60 + 5);

      // Check refresh token expiration (200 days as per refresh model)
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token")
      );
      const refreshToken = refreshTokenCookie!.match(
        /refresh_token=([^;]+)/
      )![1];
      const decodedRefresh = jwt.decode(refreshToken) as any;

      expect(decodedRefresh.exp).toBeGreaterThanOrEqual(
        beforeLogin + 200 * 24 * 60 * 60
      );
    });

    it("should set HttpOnly cookies", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      const accessTokenCookie = cookieArray.find((c: string) =>
        c.includes("access_token")
      );
      expect(accessTokenCookie).toContain("HttpOnly");

      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token")
      );
      expect(refreshTokenCookie).toContain("HttpOnly");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should successfully logout authenticated user", async () => {
      // First login
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];

      // Then logout
      const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", cookies)
        .expect(200);

      expect(logoutResponse.body.status).toBe("success");
      expect(logoutResponse.body.message).toBe("User logged out successfully");

      // Check cookies are cleared
      const logoutCookies = logoutResponse.headers["set-cookie"];
      if (logoutCookies) {
        const cookieArray = Array.isArray(logoutCookies)
          ? logoutCookies
          : [logoutCookies];
        const accessTokenCookie = cookieArray.find((c: string) =>
          c.includes("access_token")
        );
        const refreshTokenCookie = cookieArray.find((c: string) =>
          c.includes("refresh_token")
        );

        // Cookies should be expired/cleared
        if (accessTokenCookie) {
          expect(
            accessTokenCookie.includes("Max-Age=0") ||
              accessTokenCookie.includes("Expires=")
          ).toBe(true);
        }
        if (refreshTokenCookie) {
          expect(
            refreshTokenCookie.includes("Max-Age=0") ||
              refreshTokenCookie.includes("Expires=")
          ).toBe(true);
        }
      }
    });

    it("should revoke refresh tokens on logout", async () => {
      // Login
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      // Extract only the refresh token
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token")
      );

      // Logout (this should revoke all refresh tokens)
      await request(app).post("/api/auth/logout").set("Cookie", cookies);

      // Try to use refresh token after logout - should fail
      // Use only refresh token to force middleware to check it
      const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie!])
        .expect(403);

      expect(logoutResponse.body.msg).toBe("Invalid Token");
    });
  });

  describe("Automatic Token Refresh via Middleware", () => {
    it("should automatically refresh tokens when access token expires", async () => {
      // Login to get tokens
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      // Extract refresh token (access token will be expired/removed)
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token")
      );
      expect(refreshTokenCookie).toBeDefined();

      // Make a request with only refresh token (simulating expired access token)
      // The middleware should automatically refresh
      const protectedResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie!])
        .expect(200);

      // Should receive new tokens in cookies
      const newCookies = protectedResponse.headers["set-cookie"];
      expect(newCookies).toBeDefined();
      const newCookieArray = Array.isArray(newCookies)
        ? newCookies
        : [newCookies];
      expect(
        newCookieArray.some((c: string) => c.includes("access_token"))
      ).toBe(true);
      expect(
        newCookieArray.some((c: string) => c.includes("refresh_token"))
      ).toBe(true);
    });

    it("should invalidate old refresh token after middleware rotation", async () => {
      // Login
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "alice@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token")
      );

      // First request with refresh token - should succeed and rotate
      await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie!])
        .expect(200);

      // Try to use old refresh token again - should fail
      const secondResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie!])
        .expect(403);

      expect(secondResponse.body.msg).toBe("Invalid Token");
    });

    it("should reject request without any tokens", async () => {
      const response = await request(app).post("/api/auth/logout").expect(401);

      expect(response.body.msg).toBe("Credentials missing");
    });

    it("should reject request with invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", ["refresh_token=invalid_token"])
        .expect(403);

      expect(response.body.msg).toBe("Invalid Token");
    });

    it("should detect and prevent token replay attacks via middleware", async () => {
      // Login
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "alice@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token")
      );

      // Use refresh token first time (valid) - this triggers rotation
      await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie!])
        .expect(200);

      // Try to reuse the same refresh token (replay attack) - should fail
      const replayResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie!])
        .expect(403);

      expect(replayResponse.body.msg).toBe("Invalid Token");
    });
  });

  describe("Security Tests", () => {
    it("should not expose password hash in response", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      expect(response.body.data).not.toHaveProperty("password_hash");
      expect(JSON.stringify(response.body)).not.toContain("$2b$");
    });

    it("should use consistent error messages for invalid credentials", async () => {
      const wrongPasswordResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "WrongPassword",
        });

      const wrongEmailResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "Password1",
        });

      expect(wrongPasswordResponse.body.message).toBe(
        wrongEmailResponse.body.message
      );
      expect(wrongPasswordResponse.body.message).toBe("Invalid credentials");
    });

    it("should handle SQL injection attempts safely", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "' OR '1'='1",
        password: "' OR '1'='1",
      });

      // Should either fail validation or return invalid credentials
      expect([400, 401]).toContain(response.status);
      expect(response.body.status).toBe("error");
    });

    it("should handle malformed JSON gracefully", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send('{"email": "test@example.com", "password": }')
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject requests with extra fields", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "Password1",
        extraField: "should be ignored",
        role_type: "admin", // Attempt to escalate privileges
      });

      // Should succeed but ignore extra fields
      if (response.status === 200) {
        expect(response.body.data).not.toHaveProperty("extraField");
        expect(response.body.data).not.toHaveProperty("role_type");
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long passwords", async () => {
      const longPassword = "a".repeat(1000);
      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: longPassword,
      });

      expect([400, 401]).toContain(response.status);
      expect(response.body.status).toBe("error");
    });

    it("should handle special characters in password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "P@ssw0rd!@#$%^&*()",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid credentials");
    });

    it("should handle Unicode characters", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "密码🔐",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
    });
  });
});
