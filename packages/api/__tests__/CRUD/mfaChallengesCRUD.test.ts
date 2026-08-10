import { randomUUID } from "crypto";
import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  createMfaChallenge,
  getMfaChallengeByJti,
  consumeMfaChallenge,
  incrementMfaChallengeAttempts,
  deleteExpiredMfaChallenges,
} from "../../src/models/mfaChallenges.models";
import { testUsers, testAdmins } from "../../src/database/test-data";
import { getUserUuid } from "../../src/database/test-data/testUuids";

const MAX_ATTEMPTS = 5;

const insertChallenge = (overrides: { ttl_seconds?: number } = {}) =>
  createMfaChallenge({
    jti: randomUUID(),
    role_id: getUserUuid(1),
    role_type: "user",
    ttl_seconds: overrides.ttl_seconds ?? 5 * 60,
  });

describe("MFA Challenges Model CRUD Operations", () => {
  beforeAll(async () => {
    await seed({ usersData: testUsers, adminsData: testAdmins });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("createMfaChallenge", () => {
    it("applies defaults on insert", async () => {
      const challenge = await insertChallenge();

      expect(challenge.consumed_at).toBeNull();
      expect(challenge.failed_attempts).toBe(0);
      expect(challenge.created_at).toBeDefined();
      expect(challenge.role_type).toBe("user");
    });

    it("rejects a duplicate jti", async () => {
      const challenge = await insertChallenge();

      await expect(
        createMfaChallenge({
          jti: challenge.jti,
          role_id: getUserUuid(1),
          role_type: "user",
          ttl_seconds: 5 * 60,
        }),
      ).rejects.toThrow();
    });
  });

  describe("getMfaChallengeByJti", () => {
    it("returns the row for a known jti and null for an unknown one", async () => {
      const challenge = await insertChallenge();

      const found = await getMfaChallengeByJti(challenge.jti);
      expect(found?.jti).toBe(challenge.jti);

      const missing = await getMfaChallengeByJti(randomUUID());
      expect(missing).toBeNull();
    });
  });

  describe("consumeMfaChallenge", () => {
    it("consumes a live challenge exactly once", async () => {
      const challenge = await insertChallenge();

      const first = await consumeMfaChallenge(challenge.jti, MAX_ATTEMPTS);
      expect(first).not.toBeNull();
      expect(first!.consumed_at).not.toBeNull();

      const second = await consumeMfaChallenge(challenge.jti, MAX_ATTEMPTS);
      expect(second).toBeNull();
    });

    it("refuses a challenge that has exhausted its attempts", async () => {
      const challenge = await insertChallenge();

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await incrementMfaChallengeAttempts(challenge.jti, MAX_ATTEMPTS);
      }

      const consumed = await consumeMfaChallenge(challenge.jti, MAX_ATTEMPTS);
      expect(consumed).toBeNull();
    });

    it("refuses an expired challenge even when otherwise live", async () => {
      const challenge = await insertChallenge({ ttl_seconds: -1 });

      const consumed = await consumeMfaChallenge(challenge.jti, MAX_ATTEMPTS);
      expect(consumed).toBeNull();
    });
  });

  describe("incrementMfaChallengeAttempts", () => {
    it("returns the running count, and null for an unknown jti", async () => {
      const challenge = await insertChallenge();

      expect(
        await incrementMfaChallengeAttempts(challenge.jti, MAX_ATTEMPTS),
      ).toBe(1);
      expect(
        await incrementMfaChallengeAttempts(challenge.jti, MAX_ATTEMPTS),
      ).toBe(2);

      expect(
        await incrementMfaChallengeAttempts(randomUUID(), MAX_ATTEMPTS),
      ).toBeNull();
    });

    it("caps in the UPDATE itself so concurrent failures cannot exceed the budget", async () => {
      const challenge = await insertChallenge();

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        expect(
          await incrementMfaChallengeAttempts(challenge.jti, MAX_ATTEMPTS),
        ).toBe(i + 1);
      }

      // The cap predicate refuses the sixth — check-then-act cannot overrun.
      expect(
        await incrementMfaChallengeAttempts(challenge.jti, MAX_ATTEMPTS),
      ).toBeNull();
    });
  });

  describe("deleteExpiredMfaChallenges", () => {
    it("removes only expired rows", async () => {
      const live = await insertChallenge();
      const expired = await insertChallenge({ ttl_seconds: -1 });

      await deleteExpiredMfaChallenges();

      expect(await getMfaChallengeByJti(live.jti)).not.toBeNull();
      expect(await getMfaChallengeByJti(expired.jti)).toBeNull();
    });
  });
});
