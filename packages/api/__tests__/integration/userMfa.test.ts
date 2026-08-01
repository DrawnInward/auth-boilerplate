import request from "supertest";
import { TOTP, Secret } from "otpauth";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers, testAdmins } from "../../src/database/test-data";
import {
  setMfaSecret,
  enableMfa,
  createBackupCodes,
  deleteAllBackupCodes,
} from "../../src/models/mfa.models";
import { hashBackupCodes } from "../../src/utils/backupCodes";
import { MFA_CHALLENGE_MAX_ATTEMPTS } from "../../src/utils/mfaChallenge";
import { getUserUuid } from "../../src/database/test-data/testUuids";

require("dotenv").config({ quiet: true });

process.env.MFA_ENCRYPTION_KEY =
  process.env.MFA_ENCRYPTION_KEY ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.MFA_CHALLENGE_KEY =
  process.env.MFA_CHALLENGE_KEY || "test-mfa-challenge-key-for-testing";

function generateTotpCode(secret: string): string {
  const totp = new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.generate();
}

describe("User MFA Integration Tests", () => {
  let authCookies: string[];
  const testSecret = "JBSWY3DPEHPK3PXP";
  const testBackupCodes = ["ABCD-1234", "EFGH-5678", "IJKL-9012"];

  beforeAll(async () => {
    await seed({ usersData: testUsers, adminsData: testAdmins });
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "Password1" });

    authCookies = loginResponse.headers["set-cookie"] as any;
  });

  describe("GET /api/auth/mfa/status", () => {
    it("should return MFA status as disabled by default", async () => {
      const response = await request(app)
        .get("/api/auth/mfa/status")
        .set("Cookie", authCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.mfa_enabled).toBe(false);
      expect(response.body.data.backup_codes_remaining).toBe(0);
    });

    it("should require authentication", async () => {
      await request(app).get("/api/auth/mfa/status").expect(401);
    });
  });

  describe("POST /api/auth/mfa/setup", () => {
    it("should return QR code for MFA setup", async () => {
      const response = await request(app)
        .post("/api/auth/mfa/setup")
        .set("Cookie", authCookies)
        .expect(200);
      expect(response.body.status).toBe("success");
      expect(response.body.data.qr_code).toBeDefined();
      expect(response.body.data.qr_code).toContain("data:image/png;base64");
    });

    it("should fail if MFA already enabled", async () => {
      const userId = getUserUuid(1);
      await setMfaSecret(userId, "user", testSecret);
      await enableMfa(userId, "user");

      const response = await request(app)
        .post("/api/auth/mfa/setup")
        .set("Cookie", authCookies)
        .expect(400);

      expect(response.body.message).toBe("MFA is already enabled");

      await db.query(
        "UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE user_id = $1",
        [userId],
      );
    });
  });

  describe("POST /api/auth/mfa/verify-setup", () => {
    it("should enable MFA with valid code and return backup codes", async () => {
      await request(app).post("/api/auth/mfa/setup").set("Cookie", authCookies);

      const userId = getUserUuid(1);
      const result = await db.query(
        "SELECT mfa_secret FROM users WHERE user_id = $1",
        [userId],
      );

      const { decrypt } = require("../../src/utils/encryption");
      const secret = decrypt(result.rows[0].mfa_secret);
      const code = generateTotpCode(secret);

      const response = await request(app)
        .post("/api/auth/mfa/verify-setup")
        .set("Cookie", authCookies)
        .send({ code })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.backup_codes).toBeDefined();
      expect(response.body.data.backup_codes.length).toBe(10);

      await db.query(
        "UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE user_id = $1",
        [userId],
      );
      await deleteAllBackupCodes(userId, "user");
    });

    it("should reject invalid verification code", async () => {
      await request(app).post("/api/auth/mfa/setup").set("Cookie", authCookies);

      const response = await request(app)
        .post("/api/auth/mfa/verify-setup")
        .set("Cookie", authCookies)
        .send({ code: "000000" })
        .expect(401);

      expect(response.body.message).toBe("Invalid verification code");

      const userId = getUserUuid(1);
      await db.query("UPDATE users SET mfa_secret = NULL WHERE user_id = $1", [
        userId,
      ]);
    });
  });

  describe("MFA Login Flow", () => {
    const mfaUserId = getUserUuid(2);

    beforeEach(async () => {
      await setMfaSecret(mfaUserId, "user", testSecret);
      await enableMfa(mfaUserId, "user");
      const hashedCodes = await hashBackupCodes(testBackupCodes);
      await deleteAllBackupCodes(mfaUserId, "user");
      await createBackupCodes(mfaUserId, "user", hashedCodes);
    });

    afterEach(async () => {
      await db.query(
        "UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE user_id = $1",
        [mfaUserId],
      );
      await deleteAllBackupCodes(mfaUserId, "user");
    });

    it("should require MFA verification when MFA is enabled", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" })
        .expect(200);

      expect(response.body.data.mfa_required).toBe(true);

      const cookies = response.headers["set-cookie"] as any;

      expect(cookies.some((c: string) => c.includes("mfa_challenge"))).toBe(
        true,
      );
    });

    it("should complete login with valid TOTP code", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      const mfaCookies = loginResponse.headers["set-cookie"];
      const code = generateTotpCode(testSecret);

      const response = await request(app)
        .post("/api/auth/mfa/login-verify")
        .set("Cookie", mfaCookies)
        .send({ code })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Login successful");

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes("access_token"))).toBe(
        true,
      );
      expect(cookieArray.some((c: string) => c.includes("refresh_token"))).toBe(
        true,
      );
    });

    it("should complete login with valid backup code", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      const mfaCookies = loginResponse.headers["set-cookie"];

      const response = await request(app)
        .post("/api/auth/mfa/login-backup")
        .set("Cookie", mfaCookies)
        .send({ code: testBackupCodes[0] })
        .expect(200);

      expect(response.body.status).toBe("success");
    });

    it("should reject already used backup code", async () => {
      const loginResponse1 = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      await request(app)
        .post("/api/auth/mfa/login-backup")
        .set("Cookie", loginResponse1.headers["set-cookie"])
        .send({ code: testBackupCodes[1] })
        .expect(200);

      const loginResponse2 = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      const response = await request(app)
        .post("/api/auth/mfa/login-backup")
        .set("Cookie", loginResponse2.headers["set-cookie"])
        .send({ code: testBackupCodes[1] })
        .expect(401);

      expect(response.body.message).toBe("Invalid backup code");
    });

    it("should reject invalid TOTP code", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      const response = await request(app)
        .post("/api/auth/mfa/login-verify")
        .set("Cookie", loginResponse.headers["set-cookie"])
        .send({ code: "000000" })
        .expect(401);

      expect(response.body.message).toBe("Invalid verification code");
    });

    it("rejects a replayed challenge after a successful verification (S9)", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      const mfaCookies = loginResponse.headers["set-cookie"];

      await request(app)
        .post("/api/auth/mfa/login-verify")
        .set("Cookie", mfaCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(200);

      // A captured challenge cookie is now single-use: replaying it with a
      // fresh, valid TOTP code must not mint a second session.
      const replay = await request(app)
        .post("/api/auth/mfa/login-verify")
        .set("Cookie", mfaCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(401);

      expect(replay.body.message).toBe("Invalid MFA challenge token");
    });

    it("invalidates a challenge after repeated failed codes (S9)", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      const mfaCookies = loginResponse.headers["set-cookie"];

      for (let i = 0; i < MFA_CHALLENGE_MAX_ATTEMPTS; i++) {
        const response = await request(app)
          .post("/api/auth/mfa/login-verify")
          .set("Cookie", mfaCookies)
          .send({ code: "000000" })
          .expect(401);

        expect(response.body.message).toBe("Invalid verification code");
      }

      // Even the correct code is refused once the attempt budget is spent.
      const exhausted = await request(app)
        .post("/api/auth/mfa/login-verify")
        .set("Cookie", mfaCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(401);

      expect(exhausted.body.message).toBe("Invalid MFA challenge token");
    });

    it("counts failed backup-code attempts against the same challenge (S9)", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" });

      const mfaCookies = loginResponse.headers["set-cookie"];

      for (let i = 0; i < MFA_CHALLENGE_MAX_ATTEMPTS; i++) {
        await request(app)
          .post("/api/auth/mfa/login-backup")
          .set("Cookie", mfaCookies)
          .send({ code: "WRONGCODE1" })
          .expect(401);
      }

      const exhausted = await request(app)
        .post("/api/auth/mfa/login-backup")
        .set("Cookie", mfaCookies)
        .send({ code: testBackupCodes[2] })
        .expect(401);

      expect(exhausted.body.message).toBe("Invalid MFA challenge token");
    });
  });

  describe("POST /api/auth/mfa/disable", () => {
    const disableUserId = getUserUuid(1);

    beforeEach(async () => {
      await setMfaSecret(disableUserId, "user", testSecret);
      await enableMfa(disableUserId, "user");
      const hashedCodes = await hashBackupCodes(testBackupCodes);
      await deleteAllBackupCodes(disableUserId, "user");
      await createBackupCodes(disableUserId, "user", hashedCodes);
    });

    afterEach(async () => {
      await db.query(
        "UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE user_id = $1",
        [disableUserId],
      );
      await deleteAllBackupCodes(disableUserId, "user");
    });

    it("should disable MFA with valid password and TOTP code (S8)", async () => {
      const code = generateTotpCode(testSecret);

      const response = await request(app)
        .post("/api/auth/mfa/disable")
        .set("Cookie", authCookies)
        .send({ code, password: "Password1" })
        .expect(200);

      expect(response.body.message).toBe("MFA disabled successfully");

      const statusResponse = await request(app)
        .get("/api/auth/mfa/status")
        .set("Cookie", authCookies);

      expect(statusResponse.body.data.mfa_enabled).toBe(false);
    });

    it("should disable MFA with valid password and backup code (S8)", async () => {
      const response = await request(app)
        .post("/api/auth/mfa/disable")
        .set("Cookie", authCookies)
        .send({ code: testBackupCodes[0], password: "Password1" })
        .expect(200);

      expect(response.body.message).toBe("MFA disabled successfully");
    });

    it("rejects disable without a password (S8)", async () => {
      await request(app)
        .post("/api/auth/mfa/disable")
        .set("Cookie", authCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(400);
    });

    it("rejects disable with a wrong password even with a valid code (S8)", async () => {
      const response = await request(app)
        .post("/api/auth/mfa/disable")
        .set("Cookie", authCookies)
        .send({
          code: generateTotpCode(testSecret),
          password: "WrongPassword1",
        })
        .expect(401);

      expect(response.body.message).toBe("Invalid password");

      const statusResponse = await request(app)
        .get("/api/auth/mfa/status")
        .set("Cookie", authCookies);
      expect(statusResponse.body.data.mfa_enabled).toBe(true);
    });

    it("directs a passwordless (OAuth) account to set-password instead (S8)", async () => {
      const saved = await db.query(
        "SELECT password_hash FROM users WHERE user_id = $1",
        [disableUserId],
      );
      await db.query(
        "UPDATE users SET password_hash = NULL WHERE user_id = $1",
        [disableUserId],
      );

      try {
        const response = await request(app)
          .post("/api/auth/mfa/disable")
          .set("Cookie", authCookies)
          .send({ code: generateTotpCode(testSecret), password: "Password1" })
          .expect(400);

        expect(response.body.message).toBe(
          "No password set. Use set-password endpoint instead.",
        );
      } finally {
        await db.query(
          "UPDATE users SET password_hash = $1 WHERE user_id = $2",
          [saved.rows[0].password_hash, disableUserId],
        );
      }
    });

    it("should reject invalid code", async () => {
      const response = await request(app)
        .post("/api/auth/mfa/disable")
        .set("Cookie", authCookies)
        .send({ code: "invalid", password: "Password1" })
        .expect(401);

      expect(response.body.message).toBe("Invalid code");
    });
  });

  describe("POST /api/auth/mfa/backup/regenerate", () => {
    const regenUserId = getUserUuid(1);

    beforeEach(async () => {
      await setMfaSecret(regenUserId, "user", testSecret);
      await enableMfa(regenUserId, "user");
      const hashedCodes = await hashBackupCodes(testBackupCodes);
      await deleteAllBackupCodes(regenUserId, "user");
      await createBackupCodes(regenUserId, "user", hashedCodes);
    });

    afterEach(async () => {
      await db.query(
        "UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE user_id = $1",
        [regenUserId],
      );
      await deleteAllBackupCodes(regenUserId, "user");
    });

    it("should regenerate backup codes with valid TOTP code", async () => {
      const code = generateTotpCode(testSecret);

      const response = await request(app)
        .post("/api/auth/mfa/backup/regenerate")
        .set("Cookie", authCookies)
        .send({ code })
        .expect(200);

      expect(response.body.data.backup_codes).toBeDefined();
      expect(response.body.data.backup_codes.length).toBe(10);

      expect(response.body.data.backup_codes).not.toContain(testBackupCodes[0]);
    });

    it("should reject invalid TOTP code", async () => {
      const response = await request(app)
        .post("/api/auth/mfa/backup/regenerate")
        .set("Cookie", authCookies)
        .send({ code: "000000" })
        .expect(401);

      expect(response.body.message).toBe("Invalid verification code");
    });
  });
});
