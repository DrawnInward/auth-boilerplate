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
import { getAdminUuid } from "../../src/database/test-data/testUuids";
import { hashPassword } from "../../src/utils";

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

// B2: characterisation spec for the admin MFA routes, which previously had no
// spec at all. Mirrors userMfa.test.ts; 401/403-wrong-role for every route is
// asserted by roleBoundary.test.ts. Note the admin setup response key is
// `qrCode` where the user one is `qr_code` — a known D6 straggler; this pins
// current behaviour and must be updated when D6 unifies the casing.

describe("Admin MFA Integration Tests", () => {
  let adminCookies: string[];
  const testSecret = "JBSWY3DPEHPK3PXP";
  const testBackupCodes = ["ADMN-1234", "ADMN-5678", "ADMN-9012"];
  const adminId = getAdminUuid(1);

  beforeAll(async () => {
    await seed({ usersData: testUsers, adminsData: testAdmins });
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    const loginResponse = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "root.admin@test.com", password: "Password1" });

    adminCookies = loginResponse.headers["set-cookie"] as any;
  });

  const enableAdminMfa = async () => {
    await setMfaSecret(adminId, "admin", testSecret);
    await enableMfa(adminId, "admin");
    const hashedCodes = await hashBackupCodes(testBackupCodes);
    await deleteAllBackupCodes(adminId, "admin");
    await createBackupCodes(adminId, "admin", hashedCodes);
  };

  const resetAdminMfa = async () => {
    await db.query(
      "UPDATE admins SET mfa_enabled = false, mfa_secret = NULL WHERE admin_id = $1",
      [adminId],
    );
    await deleteAllBackupCodes(adminId, "admin");
  };

  describe("GET /api/admin/auth/mfa/status", () => {
    it("returns MFA status as disabled by default", async () => {
      const response = await request(app)
        .get("/api/admin/auth/mfa/status")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.mfa_enabled).toBe(false);
    });
  });

  describe("POST /api/admin/auth/mfa/setup", () => {
    afterEach(resetAdminMfa);

    it("returns a QR code for MFA setup", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/setup")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.message).toBe("MFA setup initiated");
      expect(response.body.data.qrCode).toContain("data:image/png;base64");
    });

    it("fails if MFA is already enabled", async () => {
      await enableAdminMfa();

      const response = await request(app)
        .post("/api/admin/auth/mfa/setup")
        .set("Cookie", adminCookies)
        .expect(400);

      expect(response.body.message).toBe("MFA is already enabled");
    });
  });

  describe("POST /api/admin/auth/mfa/verify-setup", () => {
    afterEach(resetAdminMfa);

    it("enables MFA with a valid TOTP code and returns backup codes", async () => {
      await setMfaSecret(adminId, "admin", testSecret);

      const response = await request(app)
        .post("/api/admin/auth/mfa/verify-setup")
        .set("Cookie", adminCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(200);

      expect(response.body.data.backup_codes).toHaveLength(10);

      const statusResponse = await request(app)
        .get("/api/admin/auth/mfa/status")
        .set("Cookie", adminCookies);
      expect(statusResponse.body.data.mfa_enabled).toBe(true);
    });

    it("rejects an invalid code", async () => {
      await setMfaSecret(adminId, "admin", testSecret);

      await request(app)
        .post("/api/admin/auth/mfa/verify-setup")
        .set("Cookie", adminCookies)
        .send({ code: "000000" })
        .expect(401);
    });

    it("rejects verification before setup was initiated", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/verify-setup")
        .set("Cookie", adminCookies)
        .send({ code: "123456" })
        .expect(400);

      expect(response.body.message).toBe("MFA setup not initiated");
    });

    it("rejects a malformed body", async () => {
      await request(app)
        .post("/api/admin/auth/mfa/verify-setup")
        .set("Cookie", adminCookies)
        .send({})
        .expect(400);
    });
  });

  describe("POST /api/admin/auth/mfa/verify", () => {
    afterEach(resetAdminMfa);

    it("verifies a valid TOTP code when MFA is enabled", async () => {
      await enableAdminMfa();

      const response = await request(app)
        .post("/api/admin/auth/mfa/verify")
        .set("Cookie", adminCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(200);

      expect(response.body.message).toBe("MFA verification successful");
    });

    it("rejects when MFA is not enabled", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/verify")
        .set("Cookie", adminCookies)
        .send({ code: "123456" })
        .expect(400);

      expect(response.body.message).toBe("MFA not enabled");
    });

    it("rejects an invalid code", async () => {
      await enableAdminMfa();

      await request(app)
        .post("/api/admin/auth/mfa/verify")
        .set("Cookie", adminCookies)
        .send({ code: "000000" })
        .expect(401);
    });
  });

  describe("POST /api/admin/auth/mfa/disable", () => {
    beforeEach(enableAdminMfa);
    afterEach(resetAdminMfa);

    it("disables MFA with a valid password and TOTP code (S8)", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/disable")
        .set("Cookie", adminCookies)
        .send({ code: generateTotpCode(testSecret), password: "Password1" })
        .expect(200);

      expect(response.body.message).toBe("MFA disabled successfully");

      const statusResponse = await request(app)
        .get("/api/admin/auth/mfa/status")
        .set("Cookie", adminCookies);
      expect(statusResponse.body.data.mfa_enabled).toBe(false);
    });

    it("disables MFA with a valid password and backup code (S8)", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/disable")
        .set("Cookie", adminCookies)
        .send({ code: testBackupCodes[0], password: "Password1" })
        .expect(200);

      expect(response.body.message).toBe("MFA disabled successfully");
    });

    it("rejects disable without a password (S8)", async () => {
      await request(app)
        .post("/api/admin/auth/mfa/disable")
        .set("Cookie", adminCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(400);
    });

    it("rejects disable with a wrong password even with a valid code (S8)", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/disable")
        .set("Cookie", adminCookies)
        .send({
          code: generateTotpCode(testSecret),
          password: "WrongPassword1",
        })
        .expect(401);

      expect(response.body.message).toBe("Invalid password");

      const statusResponse = await request(app)
        .get("/api/admin/auth/mfa/status")
        .set("Cookie", adminCookies);
      expect(statusResponse.body.data.mfa_enabled).toBe(true);
    });

    it("rejects an invalid code", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/disable")
        .set("Cookie", adminCookies)
        .send({ code: "invalid", password: "Password1" })
        .expect(401);

      expect(response.body.message).toBe("Invalid code");
    });
  });

  describe("POST /api/admin/auth/mfa/backup/verify", () => {
    beforeEach(enableAdminMfa);
    afterEach(resetAdminMfa);

    it("verifies and consumes a backup code", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/backup/verify")
        .set("Cookie", adminCookies)
        .send({ code: testBackupCodes[1] })
        .expect(200);

      expect(response.body.message).toBe("Backup code verified successfully");

      // Consumed: the same code is rejected on reuse.
      await request(app)
        .post("/api/admin/auth/mfa/backup/verify")
        .set("Cookie", adminCookies)
        .send({ code: testBackupCodes[1] })
        .expect(401);
    });

    it("rejects when MFA is not enabled", async () => {
      await resetAdminMfa();

      await request(app)
        .post("/api/admin/auth/mfa/backup/verify")
        .set("Cookie", adminCookies)
        .send({ code: testBackupCodes[0] })
        .expect(400);
    });
  });

  describe("POST /api/admin/auth/mfa/backup/regenerate", () => {
    beforeEach(enableAdminMfa);
    afterEach(resetAdminMfa);

    it("regenerates backup codes with a valid TOTP code", async () => {
      const response = await request(app)
        .post("/api/admin/auth/mfa/backup/regenerate")
        .set("Cookie", adminCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(200);

      expect(response.body.data.backup_codes).toHaveLength(10);

      // The old codes are gone: one of the replaced set no longer verifies.
      await request(app)
        .post("/api/admin/auth/mfa/backup/verify")
        .set("Cookie", adminCookies)
        .send({ code: testBackupCodes[2] })
        .expect(401);
    });

    it("rejects an invalid code", async () => {
      await request(app)
        .post("/api/admin/auth/mfa/backup/regenerate")
        .set("Cookie", adminCookies)
        .send({ code: "000000" })
        .expect(401);
    });
  });

  // Mirrors userMfa.test.ts's "MFA Login Flow" — the admin twin runs the same
  // challenge machinery (guard/fail/consume, S9) through its own controller,
  // which Phase C will collapse into one service; this spec is what proves
  // that collapse preserves admin behaviour.
  describe("Admin MFA Login Flow", () => {
    beforeEach(enableAdminMfa);
    afterEach(resetAdminMfa);

    const loginForChallenge = async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .send({ email: "root.admin@test.com", password: "Password1" })
        .expect(200);
      return response;
    };

    it("requires MFA verification when MFA is enabled", async () => {
      const response = await loginForChallenge();

      expect(response.body.data.mfa_required).toBe(true);
      expect(response.body.message).toBe("MFA verification required");

      const cookies = response.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.includes("mfa_challenge"))).toBe(true);
      expect(cookies.some((c) => c.startsWith("access_token="))).toBe(false);
    });

    it("completes login with a valid TOTP code", async () => {
      const login = await loginForChallenge();

      const response = await request(app)
        .post("/api/admin/auth/mfa/login-verify")
        .set("Cookie", login.headers["set-cookie"])
        .send({ code: generateTotpCode(testSecret) })
        .expect(200);

      expect(response.body.message).toBe("Login successful");
      expect(response.body.data.admin_id).toBe(adminId);

      const cookies = response.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.includes("access_token"))).toBe(true);
      expect(cookies.some((c) => c.includes("refresh_token"))).toBe(true);
    });

    it("completes login with a valid backup code", async () => {
      const login = await loginForChallenge();

      const response = await request(app)
        .post("/api/admin/auth/mfa/login-backup")
        .set("Cookie", login.headers["set-cookie"])
        .send({ code: testBackupCodes[0] })
        .expect(200);

      expect(response.body.message).toBe("Login successful");
      expect(response.body.data.admin_id).toBe(adminId);
    });

    it("rejects an already used backup code", async () => {
      const firstLogin = await loginForChallenge();
      await request(app)
        .post("/api/admin/auth/mfa/login-backup")
        .set("Cookie", firstLogin.headers["set-cookie"])
        .send({ code: testBackupCodes[1] })
        .expect(200);

      const secondLogin = await loginForChallenge();
      const response = await request(app)
        .post("/api/admin/auth/mfa/login-backup")
        .set("Cookie", secondLogin.headers["set-cookie"])
        .send({ code: testBackupCodes[1] })
        .expect(401);

      expect(response.body.message).toBe("Invalid backup code");
    });

    it("rejects an invalid TOTP code", async () => {
      const login = await loginForChallenge();

      const response = await request(app)
        .post("/api/admin/auth/mfa/login-verify")
        .set("Cookie", login.headers["set-cookie"])
        .send({ code: "000000" })
        .expect(401);

      expect(response.body.message).toBe("Invalid verification code");
    });

    it("rejects a replayed challenge after a successful verification (S9)", async () => {
      const login = await loginForChallenge();
      const mfaCookies = login.headers["set-cookie"];

      await request(app)
        .post("/api/admin/auth/mfa/login-verify")
        .set("Cookie", mfaCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(200);

      // A captured challenge cookie is single-use: replaying it with a
      // fresh, valid TOTP code must not mint a second session.
      const replay = await request(app)
        .post("/api/admin/auth/mfa/login-verify")
        .set("Cookie", mfaCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(401);

      expect(replay.body.message).toBe("Invalid MFA challenge token");
    });

    it("invalidates a challenge after repeated failed codes (S9)", async () => {
      const login = await loginForChallenge();
      const mfaCookies = login.headers["set-cookie"];

      for (let i = 0; i < MFA_CHALLENGE_MAX_ATTEMPTS; i++) {
        const response = await request(app)
          .post("/api/admin/auth/mfa/login-verify")
          .set("Cookie", mfaCookies)
          .send({ code: "000000" })
          .expect(401);

        expect(response.body.message).toBe("Invalid verification code");
      }

      // Even the correct code is refused once the attempt budget is spent.
      const exhausted = await request(app)
        .post("/api/admin/auth/mfa/login-verify")
        .set("Cookie", mfaCookies)
        .send({ code: generateTotpCode(testSecret) })
        .expect(401);

      expect(exhausted.body.message).toBe("Invalid MFA challenge token");
    });

    it("counts failed backup-code attempts against the same challenge (S9)", async () => {
      const login = await loginForChallenge();
      const mfaCookies = login.headers["set-cookie"];

      for (let i = 0; i < MFA_CHALLENGE_MAX_ATTEMPTS; i++) {
        await request(app)
          .post("/api/admin/auth/mfa/login-backup")
          .set("Cookie", mfaCookies)
          .send({ code: "WRONGCODE1" })
          .expect(401);
      }

      const exhausted = await request(app)
        .post("/api/admin/auth/mfa/login-backup")
        .set("Cookie", mfaCookies)
        .send({ code: testBackupCodes[2] })
        .expect(401);

      expect(exhausted.body.message).toBe("Invalid MFA challenge token");
    });
  });

  // An admin deleted between challenge and verify must not be issued a session
  // — this path previously minted one, with root defaulted to false, for an
  // admin that no longer existed (authService C1). The backup-code route is
  // the live wiring for this guard: backup codes are keyed by role_id and
  // survive the admin row, whereas the TOTP route already 400s at the secret
  // lookup.
  describe("MFA login for a deleted admin", () => {
    const ghostEmail = "ghost.admin@test.com";
    let ghostAdminId: string;

    beforeEach(async () => {
      const result = await db.query(
        `INSERT INTO admins (email, password_hash, root, email_verified, is_active)
         VALUES ($1, $2, false, true, true)
         RETURNING admin_id`,
        [ghostEmail, await hashPassword("Password1")],
      );
      ghostAdminId = result.rows[0].admin_id;
      await setMfaSecret(ghostAdminId, "admin", testSecret);
      await enableMfa(ghostAdminId, "admin");
      const hashedCodes = await hashBackupCodes(testBackupCodes);
      await createBackupCodes(ghostAdminId, "admin", hashedCodes);
    });

    afterEach(async () => {
      await deleteAllBackupCodes(ghostAdminId, "admin");
      await db.query("DELETE FROM mfa_challenges WHERE role_id = $1", [
        ghostAdminId,
      ]);
      await db.query("DELETE FROM admins WHERE admin_id = $1", [ghostAdminId]);
    });

    it("refuses backup-code verification when the admin no longer exists", async () => {
      const login = await request(app)
        .post("/api/admin/auth/login")
        .send({ email: ghostEmail, password: "Password1" })
        .expect(200);
      expect(login.body.data.mfa_required).toBe(true);

      await db.query("DELETE FROM admins WHERE admin_id = $1", [ghostAdminId]);

      const response = await request(app)
        .post("/api/admin/auth/mfa/login-backup")
        .set("Cookie", login.headers["set-cookie"])
        .send({ code: testBackupCodes[0] })
        .expect(404);

      expect(response.body.message).toBe("Admin not found");

      const cookies = (response.headers["set-cookie"] ??
        []) as unknown as string[];
      expect(cookies.some((c) => c.startsWith("access_token="))).toBe(false);
      expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(false);
    });
  });
});
