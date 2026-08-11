import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers, testAdmins } from "../../src/database/test-data";
import { getUserUuid } from "../../src/database/test-data/testUuids";
import { hashPassword } from "../../src/utils";

require("dotenv").config({ quiet: true });

// Mock Google OAuth utilities
jest.mock("../../src/utils/googleOAuth", () => ({
  isGoogleOAuthConfigured: jest.fn(() => true),
  generateOAuthState: jest.fn(() => "test-oauth-state-12345"),
  getGoogleAuthUrl: jest.fn(
    (state: string) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&client_id=test`,
  ),
  exchangeCodeForTokens: jest.fn(() =>
    Promise.resolve({
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    }),
  ),
  getGoogleUserInfo: jest.fn(() =>
    Promise.resolve({
      id: "google-user-id-12345",
      email: "newgoogleuser@example.com",
      verified_email: true,
      name: "Google User",
      picture: "https://example.com/photo.jpg",
    }),
  ),
}));

const { getGoogleUserInfo } = require("../../src/utils/googleOAuth");

describe("User OAuth Integration Tests", () => {
  beforeAll(async () => {
    await seed({ usersData: testUsers, adminsData: testAdmins });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/oauth/google", () => {
    it("should return Google auth URL", async () => {
      const response = await request(app).get("/api/oauth/google").expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.url).toContain("accounts.google.com");
      expect(response.body.data.url).toContain("test-oauth-state-12345");

      const cookies = response.headers["set-cookie"] as any;
      expect(cookies.some((c: string) => c.includes("oauth_state"))).toBe(true);
    });

    it("should return 503 when Google OAuth not configured", async () => {
      const {
        isGoogleOAuthConfigured,
      } = require("../../src/utils/googleOAuth");
      isGoogleOAuthConfigured.mockReturnValueOnce(false);

      const response = await request(app).get("/api/oauth/google").expect(503);

      expect(response.body.message).toBe("Google OAuth is not configured");
    });
  });

  describe("GET /api/oauth/google/callback", () => {
    it("should create new user for new Google account", async () => {
      // First initiate OAuth to get state cookie
      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("newgoogleuser@example.com");

      const cookies = response.headers["set-cookie"];

      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes("access_token"))).toBe(
        true,
      );
      expect(cookieArray.some((c: string) => c.includes("refresh_token"))).toBe(
        true,
      );

      // Clean up - delete the created user
      await db.query("DELETE FROM users WHERE email = $1", [
        "newgoogleuser@example.com",
      ]);
    });

    it("should return needs_linking when email already exists", async () => {
      // Mock Google returning an email that already exists
      getGoogleUserInfo.mockResolvedValueOnce({
        id: "new-google-id-999",
        email: "test@example.com", // This user exists in test data
        verified_email: true,
        name: "Test User",
      });

      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(200);

      expect(response.body.data.needs_linking).toBe(true);
      expect(response.body.data.email).toBe("test@example.com");

      const cookies = response.headers["set-cookie"] as any;
      expect(cookies.some((c: string) => c.includes("oauth_pending"))).toBe(
        true,
      );
    });

    it("should reject invalid OAuth state", async () => {
      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "wrong-state" })
        .set("Cookie", stateCookie)
        .expect(401);

      expect(response.body.message).toBe("Invalid OAuth state");
    });

    it("should reject missing authorization code", async () => {
      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(400);

      expect(response.body.message).toBe("Authorization code missing");
    });

    it("should reject unverified Google email", async () => {
      getGoogleUserInfo.mockResolvedValueOnce({
        id: "unverified-google-id",
        email: "unverified@example.com",
        verified_email: false,
        name: "Unverified User",
      });

      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(400);

      expect(response.body.message).toBe("Google email not verified");
    });
  });

  describe("POST /api/oauth/google/link", () => {
    beforeEach(async () => {
      // Reset mock
      getGoogleUserInfo.mockResolvedValue({
        id: "link-google-id-123",
        email: "test@example.com",
        verified_email: true,
        name: "Test User",
      });
    });

    it("should link Google account with valid password", async () => {
      // First trigger the needs_linking flow
      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const callbackResponse = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie);

      const pendingCookie = callbackResponse.headers["set-cookie"];

      const response = await request(app)
        .post("/api/oauth/google/link")
        .set("Cookie", pendingCookie)
        .send({ password: "Password1" })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Google account linked successfully");

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes("access_token"))).toBe(
        true,
      );

      // Clean up - unlink the Google account
      const userId = getUserUuid(1);
      await db.query(
        "UPDATE users SET google_id = NULL, auth_provider = 'local' WHERE user_id = $1",
        [userId],
      );
    });

    it("should reject invalid password", async () => {
      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const callbackResponse = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie);

      const pendingCookie = callbackResponse.headers["set-cookie"];

      const response = await request(app)
        .post("/api/oauth/google/link")
        .set("Cookie", pendingCookie)
        .send({ password: "WrongPassword" })
        .expect(401);

      expect(response.body.message).toBe("Invalid password");
    });

    it("should reject when no pending link", async () => {
      const response = await request(app)
        .post("/api/oauth/google/link")
        .send({ password: "Password1" })
        .expect(400);

      expect(response.body.message).toBe("No pending Google link");
    });

    it("rejects a forged (unsigned) oauth_pending cookie (S3)", async () => {
      // The old format was plain base64, so an attacker could forge a cookie
      // binding any google_id to an account they hold the password for. An
      // unsigned cookie must now be rejected rather than trusted.
      const forged = Buffer.from(
        JSON.stringify({
          google_id: "attacker-chosen-google-id",
          email: "test@example.com",
        }),
      ).toString("base64");

      const response = await request(app)
        .post("/api/oauth/google/link")
        .set("Cookie", [`oauth_pending=${forged}`])
        .send({ password: "Password1" })
        .expect(400);

      expect(response.body.message).toBe("Invalid pending Google link");
    });
  });

  describe("POST /api/oauth/google/unlink", () => {
    let authCookies: string[];
    const userId = getUserUuid(1);

    beforeEach(async () => {
      // Login first
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "Password1" });

      authCookies = loginResponse.headers["set-cookie"] as any;

      // Link a Google account for testing
      await db.query(
        "UPDATE users SET google_id = $1, auth_provider = 'both' WHERE user_id = $2",
        ["test-google-id-for-unlink", userId],
      );
    });

    afterEach(async () => {
      // Clean up
      await db.query(
        "UPDATE users SET google_id = NULL, auth_provider = 'local' WHERE user_id = $1",
        [userId],
      );
    });

    it("should unlink Google account when user has password", async () => {
      const response = await request(app)
        .post("/api/oauth/google/unlink")
        .set("Cookie", authCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Google account unlinked");

      // Verify Google ID is removed
      const result = await db.query(
        "SELECT google_id, auth_provider FROM users WHERE user_id = $1",
        [userId],
      );
      expect(result.rows[0].google_id).toBeNull();
      expect(result.rows[0].auth_provider).toBe("local");
    });

    it("should require authentication", async () => {
      await request(app).post("/api/oauth/google/unlink").expect(401);
    });
  });

  describe("POST /api/auth/set-password", () => {
    let oauthUserId: string;
    let authCookies: string[];

    beforeEach(async () => {
      // Create an OAuth-only user (no password)
      const result = await db.query(
        `INSERT INTO users (email, google_id, auth_provider, email_verified, is_active)
         VALUES ($1, $2, 'google', true, true)
         RETURNING user_id`,
        ["oauthonly@example.com", "oauth-only-google-id"],
      );
      oauthUserId = result.rows[0].user_id;

      // Create access token for this user
      // Note: refresh token not needed - authoriseUser middleware uses access_token directly when valid
      const jwt = require("jsonwebtoken");
      const accessToken = jwt.sign(
        { role_id: oauthUserId, role_type: "user", email_verified: true },
        process.env.USER_ACCESS_KEY || "test-user-access-key",
        { expiresIn: "15m" },
      );

      authCookies = [`access_token=${accessToken}; Path=/; HttpOnly`];
    });

    afterEach(async () => {
      if (oauthUserId) {
        await db.query("DELETE FROM users WHERE user_id = $1", [oauthUserId]);
      }
    });

    it("should set password for OAuth user", async () => {
      const response = await request(app)
        .post("/api/auth/set-password")
        .set("Cookie", authCookies)
        .send({ password: "NewPassword1" })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Password set successfully");

      // Verify password was set
      const result = await db.query(
        "SELECT password_hash, auth_provider FROM users WHERE user_id = $1",
        [oauthUserId],
      );
      expect(result.rows[0].password_hash).toBeTruthy();
      expect(result.rows[0].auth_provider).toBe("both");
    });

    it("should reject if password already set", async () => {
      // Set a password first
      const passwordHash = await hashPassword("ExistingPassword1");
      await db.query("UPDATE users SET password_hash = $1 WHERE user_id = $2", [
        passwordHash,
        oauthUserId,
      ]);

      const response = await request(app)
        .post("/api/auth/set-password")
        .set("Cookie", authCookies)
        .send({ password: "NewPassword1" })
        .expect(400);

      expect(response.body.message).toBe(
        "Password already set. Use password reset instead.",
      );
    });

    it("should require authentication", async () => {
      await request(app)
        .post("/api/auth/set-password")
        .send({ password: "NewPassword1" })
        .expect(401);
    });
  });

  describe("OAuth + MFA Flow", () => {
    const mfaOAuthUserId = getUserUuid(3);
    const testSecret = "JBSWY3DPEHPK3PXP";

    beforeEach(async () => {
      // Set up user with both Google and MFA. BOB's fixture row is inactive;
      // since the callback refuses deactivated accounts (the hardening
      // gate), this flow needs him active for its duration.
      await db.query(
        `UPDATE users
         SET google_id = $1, auth_provider = 'both', mfa_enabled = true, mfa_secret = $2,
             is_active = true
         WHERE user_id = $3`,
        [
          "mfa-oauth-google-id",
          require("../../src/utils/encryption").encrypt(testSecret),
          mfaOAuthUserId,
        ],
      );
    });

    afterEach(async () => {
      await db.query(
        `UPDATE users
         SET google_id = NULL, auth_provider = 'local', mfa_enabled = false, mfa_secret = NULL,
             is_active = false
         WHERE user_id = $1`,
        [mfaOAuthUserId],
      );
    });

    it("should require MFA when existing Google user has MFA enabled", async () => {
      getGoogleUserInfo.mockResolvedValueOnce({
        id: "mfa-oauth-google-id",
        email: "charlie@example.com",
        verified_email: true,
        name: "Charlie",
      });

      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(200);

      expect(response.body.data.mfa_required).toBe(true);

      const cookies = response.headers["set-cookie"] as any;
      expect(cookies.some((c: string) => c.includes("mfa_challenge"))).toBe(
        true,
      );
    });
  });

  // The callback and link gates refuse a deactivated principal up front —
  // before any MFA challenge is minted — with issueSession's structural
  // refusal (authService C1) as the backstop. BOB is seeded deactivated,
  // which is exactly what these paths need.
  describe("OAuth + deactivated account", () => {
    const deactivatedUserId = getUserUuid(3);

    afterEach(async () => {
      await db.query(
        `UPDATE users
         SET google_id = NULL, auth_provider = 'local', mfa_enabled = false, mfa_secret = NULL
         WHERE user_id = $1`,
        [deactivatedUserId],
      );
    });

    it("refuses Google login for a deactivated account", async () => {
      await db.query(
        "UPDATE users SET google_id = $1, auth_provider = 'both' WHERE user_id = $2",
        ["deactivated-google-id", deactivatedUserId],
      );
      getGoogleUserInfo.mockResolvedValueOnce({
        id: "deactivated-google-id",
        email: "bob@example.com",
        verified_email: true,
        name: "Bob",
      });

      const before = await db.query(
        "SELECT COUNT(*)::int AS n FROM refresh WHERE role_id = $1",
        [deactivatedUserId],
      );

      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(403);

      expect(response.body.message).toBe("Account is deactivated");

      const cookies = (response.headers["set-cookie"] ??
        []) as unknown as string[];
      expect(cookies.some((c) => c.startsWith("access_token="))).toBe(false);
      expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(false);

      const after = await db.query(
        "SELECT COUNT(*)::int AS n FROM refresh WHERE role_id = $1",
        [deactivatedUserId],
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it("refuses a deactivated MFA account before minting a challenge", async () => {
      // The gate must fire ahead of the MFA branch: a deactivated account
      // with MFA enabled gets the same plain 403, never a challenge it
      // could not complete anyway.
      await db.query(
        `UPDATE users
         SET google_id = $1, auth_provider = 'both', mfa_enabled = true, mfa_secret = $2
         WHERE user_id = $3`,
        [
          "deactivated-mfa-google-id",
          require("../../src/utils/encryption").encrypt("JBSWY3DPEHPK3PXP"),
          deactivatedUserId,
        ],
      );
      getGoogleUserInfo.mockResolvedValueOnce({
        id: "deactivated-mfa-google-id",
        email: "bob@example.com",
        verified_email: true,
        name: "Bob",
      });

      // Earlier specs in this file mint challenges for the same fixture user,
      // so pin the delta, not an absolute count.
      const before = await db.query(
        "SELECT COUNT(*)::int AS n FROM mfa_challenges WHERE role_id = $1",
        [deactivatedUserId],
      );

      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(403);

      expect(response.body.message).toBe("Account is deactivated");

      const cookies = (response.headers["set-cookie"] ??
        []) as unknown as string[];
      expect(cookies.some((c) => c.startsWith("mfa_challenge="))).toBe(false);
      expect(cookies.some((c) => c.startsWith("access_token="))).toBe(false);
      expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(false);

      // No challenge row was persisted either — the refusal precedes A7's
      // challenge mint, not just the cookie.
      const after = await db.query(
        "SELECT COUNT(*)::int AS n FROM mfa_challenges WHERE role_id = $1",
        [deactivatedUserId],
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it("refuses Google linking for a deactivated account, and rolls the link back", async () => {
      getGoogleUserInfo.mockResolvedValueOnce({
        id: "bob-link-google-id",
        email: "bob@example.com",
        verified_email: true,
        name: "Bob",
      });

      const initResponse = await request(app).get("/api/oauth/google");
      const stateCookie = initResponse.headers["set-cookie"];

      const callbackResponse = await request(app)
        .get("/api/oauth/google/callback")
        .query({ code: "valid-auth-code", state: "test-oauth-state-12345" })
        .set("Cookie", stateCookie)
        .expect(200);

      expect(callbackResponse.body.data.needs_linking).toBe(true);

      const pendingCookie = callbackResponse.headers["set-cookie"];

      const response = await request(app)
        .post("/api/oauth/google/link")
        .set("Cookie", pendingCookie)
        .send({ password: "Password1" })
        .expect(403);

      expect(response.body.message).toBe("Account is deactivated");

      // The gate refuses before the link is attempted (and before the
      // password is even compared): no half-linked state may survive.
      const row = await db.query(
        "SELECT google_id, auth_provider FROM users WHERE user_id = $1",
        [deactivatedUserId],
      );
      expect(row.rows[0].google_id).toBeNull();
      expect(row.rows[0].auth_provider).toBe("local");

      const cookies = (response.headers["set-cookie"] ??
        []) as unknown as string[];
      expect(cookies.some((c) => c.startsWith("access_token="))).toBe(false);
    });
  });
});
