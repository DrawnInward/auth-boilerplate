import { encrypt, decrypt } from "../../src/utils/encryption";
import { HttpError } from "../../src/utils/httpError";

// B5: the AES-256-GCM wrapper that protects MFA secrets at rest.

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryption", () => {
  // The not-configured test deletes the key; suites share one process under
  // --runInBand, so restore whatever was set before this file ran.
  const originalKey = process.env.MFA_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.MFA_ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.MFA_ENCRYPTION_KEY;
    } else {
      process.env.MFA_ENCRYPTION_KEY = originalKey;
    }
  });

  it("round-trips a plaintext", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("round-trips the empty string and unicode", () => {
    expect(decrypt(encrypt(""))).toBe("");
    expect(decrypt(encrypt("pässwörd £× 秘密"))).toBe("pässwörd £× 秘密");
  });

  it("uses a fresh IV per call: same plaintext, different ciphertext", () => {
    expect(encrypt("same input")).not.toBe(encrypt("same input"));
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    const data = Buffer.from(encrypt("integrity matters"), "base64");
    // Flip one bit in the encrypted payload (past the 16-byte IV + 16-byte tag).
    data[33] ^= 0x01;
    expect(() => decrypt(data.toString("base64"))).toThrow();
  });

  it("rejects decryption under a different key", () => {
    const ciphertext = encrypt("keyed to one deployment");
    process.env.MFA_ENCRYPTION_KEY =
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    expect(() => decrypt(ciphertext)).toThrow();
  });

  it("throws a 500 HttpError when the key is not configured", () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    let caught: unknown;
    try {
      encrypt("anything");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpError);
    expect(caught).toMatchObject({ status: 500 });
  });
});
