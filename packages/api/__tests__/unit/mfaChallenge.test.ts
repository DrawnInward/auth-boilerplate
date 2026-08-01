import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import {
  verifyMfaChallengeToken,
  MFA_CHALLENGE_MAX_ATTEMPTS,
} from "../../src/utils/mfaChallenge";
import { HttpError } from "../../src/utils/httpError";

// B5: the pure JWT half of the MFA challenge (mint/persist and the DB-backed
// guard/consume paths are covered by the S9 integration tests in
// userMfa.test.ts).

const TEST_KEY = "unit-test-mfa-challenge-key";

const expectHttpError = (fn: () => void, status: number, msg: string) => {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(HttpError);
  expect(caught).toMatchObject({ status, msg });
};

describe("mfaChallenge", () => {
  beforeEach(() => {
    process.env.MFA_CHALLENGE_KEY = TEST_KEY;
  });

  describe("verifyMfaChallengeToken", () => {
    const signChallenge = (
      overrides: Record<string, unknown> = {},
      options: jwt.SignOptions = { expiresIn: "5m", jwtid: randomUUID() },
      key: string = TEST_KEY,
    ) =>
      jwt.sign(
        {
          role_id: randomUUID(),
          role_type: "user",
          type: "mfa_challenge",
          ...overrides,
        },
        key,
        options,
      );

    it("returns the payload of a valid challenge token", () => {
      const token = signChallenge();
      const payload = verifyMfaChallengeToken(token);

      expect(payload.type).toBe("mfa_challenge");
      expect(payload.role_type).toBe("user");
      expect(payload.jti).toBeDefined();
    });

    it("rejects a token of the wrong type (an access token is not a challenge)", () => {
      const token = signChallenge({ type: "access" });
      expectHttpError(
        () => verifyMfaChallengeToken(token),
        401,
        "Invalid MFA challenge token",
      );
    });

    it("rejects an expired token with its own message", () => {
      const token = signChallenge(
        {},
        { expiresIn: "-1s", jwtid: randomUUID() },
      );
      expectHttpError(
        () => verifyMfaChallengeToken(token),
        401,
        "MFA challenge expired",
      );
    });

    it("rejects a token signed with a different key", () => {
      const token = signChallenge({}, { expiresIn: "5m" }, "wrong-key");
      expectHttpError(
        () => verifyMfaChallengeToken(token),
        401,
        "Invalid MFA challenge token",
      );
    });

    it("rejects garbage", () => {
      expectHttpError(
        () => verifyMfaChallengeToken("not.a.jwt"),
        401,
        "Invalid MFA challenge token",
      );
    });

    it("throws a 500 when the key is not configured", () => {
      delete process.env.MFA_CHALLENGE_KEY;
      expectHttpError(
        () => verifyMfaChallengeToken("anything"),
        500,
        "MFA_CHALLENGE_KEY not configured",
      );
    });
  });

  it("caps challenge attempts at 5 (S9 contract)", () => {
    expect(MFA_CHALLENGE_MAX_ATTEMPTS).toBe(5);
  });
});
