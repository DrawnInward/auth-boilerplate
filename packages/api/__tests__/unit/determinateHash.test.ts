import { determinateHash } from "../../src/utils/determinateHash";

// B5: the deterministic token digest used for lookup columns — unlike bcrypt
// it must be stable across calls, or a stored token could never be found again.

describe("determinateHash", () => {
  it("matches the known SHA-256 vector", () => {
    expect(determinateHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic", () => {
    expect(determinateHash("some-token")).toBe(determinateHash("some-token"));
  });

  it("differs for different inputs", () => {
    expect(determinateHash("token-a")).not.toBe(determinateHash("token-b"));
  });

  it("always yields 64 lowercase hex characters", () => {
    expect(determinateHash("")).toMatch(/^[0-9a-f]{64}$/);
    expect(determinateHash("x".repeat(10_000))).toMatch(/^[0-9a-f]{64}$/);
  });
});
