import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  getMfaStatus,
  getMfaSecret,
  setMfaSecret,
  enableMfa,
  disableMfa,
  clearMfaSecret,
  createBackupCodes,
  getUnusedBackupCodes,
  getBackupCodeCount,
  markBackupCodeUsed,
  deleteAllBackupCodes,
} from "../../src/models/mfa.models";
import { testUsers } from "../../src/database/test-data";
import { testAdmins } from "../../src/database/test-data";
import { getUserUuid, getAdminUuid } from "../../src/database/test-data/testUuids";
import { hashBackupCodes, generateBackupCodes } from "../../src/utils/backupCodes";

describe("MFA Model CRUD Operations", () => {
  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    await seed({ usersData: testUsers, adminsData: testAdmins });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("getMfaStatus", () => {
    it("should return MFA status for user", async () => {
      const userId = getUserUuid(1);
      const status = await getMfaStatus(userId, "user");

      expect(status).toBeDefined();
      expect(status!.mfa_enabled).toBe(false);
      expect(status!.mfa_secret).toBeNull();
    });

    it("should return MFA status for admin", async () => {
      const adminId = getAdminUuid(1);
      const status = await getMfaStatus(adminId, "admin");

      expect(status).toBeDefined();
      expect(status!.mfa_enabled).toBe(false);
      expect(status!.mfa_secret).toBeNull();
    });

    it("should return null for non-existent user", async () => {
      const status = await getMfaStatus("550e8400-e29b-41d4-a716-446655440999", "user");
      expect(status).toBeNull();
    });
  });

  describe("setMfaSecret and getMfaSecret", () => {
    it("should set and get MFA secret for user", async () => {
      const userId = getUserUuid(1);
      const testSecret = "JBSWY3DPEHPK3PXP";

      await setMfaSecret(userId, "user", testSecret);
      const secret = await getMfaSecret(userId, "user");

      expect(secret).toBe(testSecret);
    });

    it("should set and get MFA secret for admin", async () => {
      const adminId = getAdminUuid(1);
      const testSecret = "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ";

      await setMfaSecret(adminId, "admin", testSecret);
      const secret = await getMfaSecret(adminId, "admin");

      expect(secret).toBe(testSecret);
    });

    it("should return null when no secret set", async () => {
      const userId = getUserUuid(2);
      const secret = await getMfaSecret(userId, "user");
      expect(secret).toBeNull();
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        setMfaSecret("550e8400-e29b-41d4-a716-446655440999", "user", "secret")
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });
  });

  describe("enableMfa and disableMfa", () => {
    it("should enable MFA for user", async () => {
      const userId = getUserUuid(1);

      await enableMfa(userId, "user");
      const status = await getMfaStatus(userId, "user");

      expect(status!.mfa_enabled).toBe(true);
    });

    it("should disable MFA for user and clear secret", async () => {
      const userId = getUserUuid(1);

      await disableMfa(userId, "user");
      const status = await getMfaStatus(userId, "user");

      expect(status!.mfa_enabled).toBe(false);
      expect(status!.mfa_secret).toBeNull();
    });

    it("should throw error for non-existent user on enable", async () => {
      await expect(
        enableMfa("550e8400-e29b-41d4-a716-446655440999", "user")
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });
  });

  describe("clearMfaSecret", () => {
    it("should clear MFA secret without disabling", async () => {
      const userId = getUserUuid(2);
      const testSecret = "TESTSECRET123456";

      await setMfaSecret(userId, "user", testSecret);
      await enableMfa(userId, "user");
      await clearMfaSecret(userId, "user");

      const status = await getMfaStatus(userId, "user");
      expect(status!.mfa_enabled).toBe(true);
      expect(status!.mfa_secret).toBeNull();

      await disableMfa(userId, "user");
    });
  });

  describe("Backup Codes", () => {
    it("should create backup codes", async () => {
      const userId = getUserUuid(1);
      const codes = generateBackupCodes();
      const hashedCodes = await hashBackupCodes(codes);

      await createBackupCodes(userId, "user", hashedCodes);
      const count = await getBackupCodeCount(userId, "user");

      expect(count).toBe(10);
    });

    it("should get unused backup codes", async () => {
      const userId = getUserUuid(1);
      const codes = await getUnusedBackupCodes(userId, "user");

      expect(codes.length).toBe(10);
      codes.forEach((code) => {
        expect(code.used_at).toBeNull();
        expect(code.code_hash).toBeDefined();
      });
    });

    it("should mark backup code as used", async () => {
      const userId = getUserUuid(1);
      const codes = await getUnusedBackupCodes(userId, "user");
      const codeToUse = codes[0];

      await markBackupCodeUsed(codeToUse.id);

      const updatedCodes = await getUnusedBackupCodes(userId, "user");
      expect(updatedCodes.length).toBe(9);

      const count = await getBackupCodeCount(userId, "user");
      expect(count).toBe(9);
    });

    it("should delete all backup codes", async () => {
      const userId = getUserUuid(1);

      await deleteAllBackupCodes(userId, "user");
      const count = await getBackupCodeCount(userId, "user");

      expect(count).toBe(0);
    });

    it("should handle backup codes for admins", async () => {
      const adminId = getAdminUuid(1);
      const codes = generateBackupCodes();
      const hashedCodes = await hashBackupCodes(codes);

      await createBackupCodes(adminId, "admin", hashedCodes);
      const count = await getBackupCodeCount(adminId, "admin");

      expect(count).toBe(10);

      await deleteAllBackupCodes(adminId, "admin");
      const finalCount = await getBackupCodeCount(adminId, "admin");
      expect(finalCount).toBe(0);
    });
  });

  describe("Transaction handling", () => {
    it("should support transactions for MFA operations", async () => {
      const client = await db.connect();
      const userId = getUserUuid(3);
      const testSecret = "TRANSACTIONSECRET";

      try {
        await client.query("BEGIN");

        await setMfaSecret(userId, "user", testSecret, client);
        await enableMfa(userId, "user", client);

        await client.query("ROLLBACK");

        const status = await getMfaStatus(userId, "user");
        expect(status!.mfa_enabled).toBe(false);
        expect(status!.mfa_secret).toBeNull();
      } finally {
        client.release();
      }
    });

    it("should support transactions for backup codes", async () => {
      const client = await db.connect();
      const userId = getUserUuid(3);
      const codes = generateBackupCodes();
      const hashedCodes = await hashBackupCodes(codes);

      try {
        await client.query("BEGIN");

        await createBackupCodes(userId, "user", hashedCodes, client);
        const countInTx = await getBackupCodeCount(userId, "user", client);
        expect(countInTx).toBe(10);

        await client.query("ROLLBACK");

        const countAfterRollback = await getBackupCodeCount(userId, "user");
        expect(countAfterRollback).toBe(0);
      } finally {
        client.release();
      }
    });
  });
});
