import {
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
} from "../../src/utils/backupCodes";

// B5: backup-code generation, hashing and constant-shape verification.

describe("backupCodes", () => {
  describe("generateBackupCodes", () => {
    it("produces 10 codes in XXXX-XXXX uppercase-hex form", () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(10);
      codes.forEach((code) => {
        expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
      });
    });

    it("produces distinct codes within a batch", () => {
      expect(new Set(generateBackupCodes()).size).toBe(10);
    });
  });

  describe("hashBackupCodes / verifyBackupCode", () => {
    it("verifies a code against its own batch and reports the index", async () => {
      const codes = ["AAAA-1111", "BBBB-2222", "CCCC-3333"];
      const hashed = await hashBackupCodes(codes);

      expect(hashed).toHaveLength(3);
      hashed.forEach((hash) => expect(hash).not.toContain("AAAA"));

      expect(await verifyBackupCode("BBBB-2222", hashed)).toBe(1);
      expect(await verifyBackupCode("CCCC-3333", hashed)).toBe(2);
    });

    it("returns -1 for a code not in the batch", async () => {
      const hashed = await hashBackupCodes(["AAAA-1111"]);
      expect(await verifyBackupCode("ZZZZ-9999", hashed)).toBe(-1);
    });

    it("returns -1 against an empty batch", async () => {
      expect(await verifyBackupCode("AAAA-1111", [])).toBe(-1);
    });
  });
});
