import { TOTP, Secret } from "otpauth";
import { generateTotpSecret, verifyTotpCode } from "../../src/utils/totp";

// B5: TOTP secret generation and code verification — pure, clockless from the
// caller's view (otpauth reads the clock; we generate the expected code with
// the same library and parameters, so the assertion holds at any instant).

const currentCodeFor = (secret: string): string =>
  new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();

describe("totp", () => {
  describe("generateTotpSecret", () => {
    it("returns a base32 secret, otpauth URI and QR data URL", async () => {
      const result = await generateTotpSecret("alice@example.com");

      expect(result.secret).toMatch(/^[A-Z2-7]+$/);
      expect(result.uri).toContain("otpauth://totp/");
      expect(result.uri).toContain(encodeURIComponent("alice@example.com"));
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("returns a fresh secret per call", async () => {
      const a = await generateTotpSecret("alice@example.com");
      const b = await generateTotpSecret("alice@example.com");
      expect(a.secret).not.toBe(b.secret);
    });
  });

  describe("verifyTotpCode", () => {
    const testSecret = "JBSWY3DPEHPK3PXP";

    it("accepts the current code for the secret", () => {
      expect(verifyTotpCode(testSecret, currentCodeFor(testSecret))).toBe(true);
    });

    it("rejects a code minted for a different secret", () => {
      const otherSecret = "GEZDGNBVGY3TQOJQ";
      expect(verifyTotpCode(testSecret, currentCodeFor(otherSecret))).toBe(
        false,
      );
    });

    it("rejects garbage codes", () => {
      expect(verifyTotpCode(testSecret, "000000")).toBe(false);
      expect(verifyTotpCode(testSecret, "not-a-code")).toBe(false);
      expect(verifyTotpCode(testSecret, "")).toBe(false);
    });

    it("round-trips with a freshly generated secret", async () => {
      const { secret } = await generateTotpSecret("bob@example.com");
      expect(verifyTotpCode(secret, currentCodeFor(secret))).toBe(true);
    });
  });
});
