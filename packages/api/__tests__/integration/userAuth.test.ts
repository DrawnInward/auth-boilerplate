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
        cookieArray.some((cookie: string) => cookie.includes("access_token")),
      ).toBe(true);
      expect(
        cookieArray.some((cookie: string) => cookie.includes("refresh_token")),
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
          email: "bob@example.com",
          password: "Password1",
        })
        .expect(403);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Account is deactivated");
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
        c.includes("access_token"),
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
        c.includes("refresh_token"),
      );
      expect(refreshTokenCookie).toBeDefined();

      const refreshTokenMatch = refreshTokenCookie!.match(
        /refresh_token=([^;]+)/,
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
        c.includes("access_token"),
      );
      const accessToken = accessTokenCookie!.match(/access_token=([^;]+)/)![1];
      const decodedAccess = jwt.decode(accessToken) as any;

      expect(decodedAccess.exp).toBeGreaterThanOrEqual(beforeLogin + 15 * 60);
      expect(decodedAccess.exp).toBeLessThanOrEqual(afterLogin + 15 * 60 + 5);

      // Refresh expiry tracks REFRESH_TOKEN_DAYS (default 7, env-overridable)
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token"),
      );
      const refreshToken = refreshTokenCookie!.match(
        /refresh_token=([^;]+)/,
      )![1];
      const decodedRefresh = jwt.decode(refreshToken) as any;

      expect(decodedRefresh.exp).toBeGreaterThanOrEqual(
        beforeLogin + 7 * 24 * 60 * 60,
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
        c.includes("access_token"),
      );
      expect(accessTokenCookie).toContain("HttpOnly");

      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token"),
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
          c.includes("access_token"),
        );
        const refreshTokenCookie = cookieArray.find((c: string) =>
          c.includes("refresh_token"),
        );

        // Cookies should be expired/cleared
        if (accessTokenCookie) {
          expect(
            accessTokenCookie.includes("Max-Age=0") ||
              accessTokenCookie.includes("Expires="),
          ).toBe(true);
        }
        if (refreshTokenCookie) {
          expect(
            refreshTokenCookie.includes("Max-Age=0") ||
              refreshTokenCookie.includes("Expires="),
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
        c.includes("refresh_token"),
      );

      // Logout (this should revoke all refresh tokens)
      await request(app).post("/api/auth/logout").set("Cookie", cookies);

      // The revoked refresh token can no longer be exchanged.
      const refreshResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenCookie!])
        .expect(401);

      expect(refreshResponse.body.message).toBe(
        "Refresh token has been revoked",
      );
    });
  });

  describe("Session refresh via POST /api/auth/refresh", () => {
    const loginRefreshCookie = async (email = "test@example.com") => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "Password1" })
        .expect(200);
      const cookies = loginResponse.headers["set-cookie"] as unknown;
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token"),
      );
      expect(refreshTokenCookie).toBeDefined();
      return refreshTokenCookie as string;
    };

    it("exchanges the refresh cookie for a fresh session", async () => {
      const refreshTokenCookie = await loginRefreshCookie();

      const refreshResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenCookie])
        .expect(200);

      expect(refreshResponse.body.status).toBe("success");
      expect(refreshResponse.body.message).toBe("Token refreshed");

      const newCookies = refreshResponse.headers["set-cookie"];
      expect(newCookies).toBeDefined();
      const newCookieArray = Array.isArray(newCookies)
        ? newCookies
        : [newCookies];
      expect(
        newCookieArray.some((c: string) => c.includes("access_token")),
      ).toBe(true);
      expect(
        newCookieArray.some((c: string) => c.includes("refresh_token")),
      ).toBe(true);

      // The fresh cookies authenticate.
      await request(app)
        .get("/api/auth/me")
        .set("Cookie", newCookieArray)
        .expect(200);
    });

    it("no longer rotates in the middleware: a refresh-only request is a plain 401", async () => {
      const refreshTokenCookie = await loginRefreshCookie();

      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", [refreshTokenCookie])
        .expect(401);

      expect(response.body.message).toBe("Credentials missing");
      // And no rotation happened as a side effect: the middleware set nothing.
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("rejects an outside-grace replay and revokes the whole session lineage", async () => {
      const { determinateHash } = await import("../../src/utils");
      const refreshTokenCookie = await loginRefreshCookie("alice@example.com");
      const refreshToken = refreshTokenCookie.match(
        /refresh_token=([^;]+)/,
      )![1];

      // Rotate once at the endpoint; keep the successor cookies.
      const first = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenCookie])
        .expect(200);
      const successorCookies = first.headers[
        "set-cookie"
      ] as unknown as string[];

      // Age the rotation past the reuse-interval, then replay the old token —
      // this is the theft signature, not a client race.
      await db.query(
        "UPDATE refresh SET used_at = NOW() - INTERVAL '10 minutes' WHERE token_hash = $1",
        [determinateHash(refreshToken)],
      );

      const replay = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenCookie])
        .expect(401);
      expect(replay.body.message).toBe(
        "Refresh token has already been used - possible security breach",
      );

      // Breach detection revoked every token in the lineage: the legitimate
      // successor is dead too.
      const successorRefresh = successorCookies.find((c) =>
        c.startsWith("refresh_token="),
      )!;
      const afterBreach = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [successorRefresh])
        .expect(401);
      expect(afterBreach.body.message).toBe("Refresh token has been revoked");
    });

    it("should reject request without any tokens", async () => {
      const response = await request(app).post("/api/auth/logout").expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });

    it("rejects a refresh call without a refresh cookie", async () => {
      const response = await request(app).post("/api/auth/refresh").expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });

    it("rejects a forged refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", ["refresh_token=invalid_token"])
        .expect(401);

      expect(response.body.message).toBe("Invalid refresh token");
    });

    it("answers a signed token with no row exactly like a forged one", async () => {
      const { determinateHash } = await import("../../src/utils");
      const refreshTokenCookie = await loginRefreshCookie("alice@example.com");
      const refreshToken = refreshTokenCookie.match(
        /refresh_token=([^;]+)/,
      )![1];

      await db.query("DELETE FROM refresh WHERE token_hash = $1", [
        determinateHash(refreshToken),
      ]);

      const response = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenCookie])
        .expect(401);

      expect(response.body.message).toBe("Invalid refresh token");
    });

    it("treats a malformed access_token cookie as absent, not a 500 (S7)", async () => {
      // Not a JWT at all — no dots, payload segment undefined. Previously the
      // decode ran outside a try, so this cookie 500'd every request.
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", ["access_token=garbage-not-a-jwt"])
        .expect(401);

      expect(response.body).toEqual({
        status: "error",
        message: "Credentials missing",
      });
    });

    it("rejects an access_token whose payload is not JSON cleanly (S7)", async () => {
      // Well-formed shape (three segments) but the middle one decodes to
      // garbage, so JSON.parse throws rather than Buffer.from.
      const notJson = Buffer.from("not json").toString("base64");
      await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [`access_token=aaa.${notJson}.bbb`])
        .expect(401);
    });

    it("ignores a malformed access cookie at the refresh endpoint (S7)", async () => {
      const refreshTokenCookie = await loginRefreshCookie("alice@example.com");

      await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", ["access_token=garbage-not-a-jwt", refreshTokenCookie])
        .expect(200);
    });

    it("never resurrects a rotated-then-logged-out lineage, even inside grace", async () => {
      const refreshTokenCookie = await loginRefreshCookie("alice@example.com");

      // Rotate, then end the session with the successor.
      const first = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenCookie])
        .expect(200);
      const successorCookies = first.headers[
        "set-cookie"
      ] as unknown as string[];
      await request(app)
        .post("/api/auth/logout")
        .set("Cookie", successorCookies)
        .expect(200);

      // Replaying the parent is within the reuse-interval, but its successor
      // is revoked — the grace window must not bring the session back.
      const replay = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenCookie])
        .expect(401);
      expect(replay.body.message).toBe("Refresh token has been revoked");
    });

    it("keeps the session alive when concurrent requests race to refresh (S1)", async () => {
      // The bug this guards: after the access token expires, an SPA fires
      // several refresh exchanges at once, all carrying the same cookie.
      // Before the reuse-interval, the first rotated and the rest were treated
      // as a replay, revoking every session on every device.
      const refreshTokenCookie = await loginRefreshCookie("alice@example.com");
      // A separate device, logged in before the race.
      const otherDeviceCookie = await loginRefreshCookie("alice@example.com");

      const [a, b] = await Promise.all([
        request(app)
          .post("/api/auth/refresh")
          .set("Cookie", [refreshTokenCookie]),
        request(app)
          .post("/api/auth/refresh")
          .set("Cookie", [refreshTokenCookie]),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 200]);

      // The session survives: the freshly issued cookies still authenticate.
      const rotated = (b.headers["set-cookie"] ??
        a.headers["set-cookie"]) as unknown as string[];
      await request(app).get("/api/auth/me").set("Cookie", rotated).expect(200);

      // And the race on one device never touched the other device's session.
      await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [otherDeviceCookie])
        .expect(200);
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
        wrongEmailResponse.body.message,
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
