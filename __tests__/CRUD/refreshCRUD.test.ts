import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  fetchRefresh,
  fetchRefreshById,
  fetchRefreshByTokenHash,
  modifyRefreshById,
  addRefresh,
  removeRefreshById,
  createAccessToken,
  revokeUserTokens,
  revokeRefreshToken,
} from "../../src/models/refresh.models";
import { determinateHash } from "../../src/utils";
import jwt from "jsonwebtoken";
import { testRefreshTokens, testUsers } from "../../src/database/test-data";
import { PoolClient } from "pg";
import {
  getAdminUuid,
  getRefreshUuid,
  getUserUuid,
} from "../../src/database/test-data/testUuids";

// Mock environment variables
const mockEnv = {
  REFRESH_KEY: "test_refresh_key_secret",
  USER_ACCESS_KEY: "test_user_access_key",
  ADMIN_ACCESS_KEY: "test_admin_access_key",
};

describe("Refresh Token Model CRUD Operations", () => {
  let client: PoolClient;
  beforeAll(async () => {
    // Set up test environment variables
    Object.entries(mockEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });
    await seed({
      usersData: testUsers,
      refreshTokensData: testRefreshTokens,
    });
  });

  beforeEach(async () => {
    client = await db.connect();
    await client.query("BEGIN");
  });

  afterEach(async () => {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  afterAll(() => {
    db.end();
  });

  describe("fetchRefresh", () => {
    it("should return all seeded refresh tokens", async () => {
      const refreshTokens = await fetchRefresh();

      expect(Array.isArray(refreshTokens)).toBe(true);
      expect(refreshTokens.length).toBe(8);

      // Verify some known tokens exist
      const tokenHashes = refreshTokens.map((t) => t.token_hash);
      expect(tokenHashes).toContain("hash_active_valid_token");
      expect(tokenHashes).toContain("hash_already_used_token");
      expect(tokenHashes).toContain("hash_expired_token");
      expect(tokenHashes).toContain("hash_admin_token");
    });

    it("should return tokens with all required fields", async () => {
      const refreshTokens = await fetchRefresh();

      refreshTokens.forEach((token) => {
        expect(token.refresh_id).toBeDefined();
        expect(token.role_id).toBeDefined();
        expect(token.role_type).toBeDefined();
        expect(token.token_hash).toBeDefined();
        expect(token.is_active).toBeDefined();
        expect(token.expiration_time).toBeDefined();
        expect(token.issued_time).toBeDefined();
      });
    });
  });

  describe("fetchRefreshById", () => {
    it("should find active valid token", async () => {
      const found = await fetchRefreshById(getRefreshUuid(1));

      expect(found).toBeDefined();
      expect(found.refresh_id).toBe(getRefreshUuid(1));
      expect(found.role_id).toBe(getUserUuid(1));
      expect(found.role_type).toBe("user");
      expect(found.is_active).toBe(true);
      expect(found.used_at).toBeNull();
      expect(found.token_hash).toBe("hash_active_valid_token");
    });

    it("should find already used token", async () => {
      const found = await fetchRefreshById(getRefreshUuid(2));

      expect(found).toBeDefined();
      expect(found.is_active).toBe(false);
      expect(found.used_at).not.toBeNull();
      expect(found.last_used_time).not.toBeNull();
    });

    it("should find expired token", async () => {
      const found = await fetchRefreshById(getRefreshUuid(3));

      expect(found).toBeDefined();
      expect(found.token_hash).toBe("hash_expired_token");
      const expirationTime = new Date(found.expiration_time!);
      expect(expirationTime < new Date()).toBe(true);
    });

    it("should throw error for non-existent ID", async () => {
      await expect(fetchRefreshById(getUserUuid(1))).rejects.toMatchObject({
        status: 404,
        msg: "Refresh token not found",
      });
    });
  });

  describe("fetchRefreshByTokenHash", () => {
    it("should find token by hash", async () => {
      const found = await fetchRefreshByTokenHash("hash_active_valid_token");

      expect(found).toBeDefined();
      expect(found.refresh_id).toBe(getRefreshUuid(1));
      expect(found.role_id).toBe(getUserUuid(1));
      expect(found.is_active).toBe(true);
    });

    it("should find admin token by hash", async () => {
      const found = await fetchRefreshByTokenHash("hash_admin_token");

      expect(found).toBeDefined();
      expect(found.refresh_id).toBe(getRefreshUuid(5));
      expect(found.role_type).toBe("admin");
    });

    it("should throw error for non-existent token hash", async () => {
      await expect(
        fetchRefreshByTokenHash("non_existent_hash")
      ).rejects.toMatchObject({
        status: 404,
        msg: "Refresh token not found",
      });
    });
  });

  describe("addRefresh", () => {
    it("should create a new refresh token", async () => {
      const newRefresh = {
        role_id: getUserUuid(1),
        role_type: "user",
      };

      const createdRefresh = await addRefresh(newRefresh);

      expect(createdRefresh).toBeDefined();
      expect(createdRefresh.refresh_id).toBeDefined();

      // Verify it was actually created
      const found = await fetchRefreshById(createdRefresh.refresh_id);
      expect(found.role_id).toBe(getUserUuid(1));
      expect(found.role_type).toBe("user");
      expect(found.is_active).toBe(true);
    });

    it("should set expiration time 3 months from issued time", async () => {
      const beforeCreation = new Date();

      const createdRefresh = await addRefresh({
        role_id: getUserUuid(2),
        role_type: "user",
      });

      const refreshRecord = await fetchRefreshById(createdRefresh.refresh_id);

      const issuedTime = new Date(refreshRecord.issued_time!);
      const expirationTime = new Date(refreshRecord.expiration_time!);

      // Check issued time is around now
      expect(issuedTime.getTime()).toBeGreaterThanOrEqual(
        beforeCreation.getTime()
      );

      // Check expiration is approximately 3 months later
      const expectedExpiration = new Date(issuedTime);
      expectedExpiration.setMonth(issuedTime.getMonth() + 3);

      expect(
        Math.abs(expirationTime.getTime() - expectedExpiration.getTime())
      ).toBeLessThan(1000);
    });
  });

  describe("modifyRefreshById", () => {
    it("should update last_used_time", async () => {
      const lastUsedTime = new Date().toISOString();
      const updated = await modifyRefreshById(
        { last_used_time: lastUsedTime },
        getRefreshUuid(1), // Active valid token
        client
      );

      expect(updated.last_used_time).toBeDefined();
      expect(new Date(updated.last_used_time!).toISOString()).toBe(
        lastUsedTime
      );
    });

    it("should deactivate an active refresh token", async () => {
      const updated = await modifyRefreshById(
        { is_active: false },
        getRefreshUuid(1), // Active valid token
        client
      );

      expect(updated.is_active).toBe(false);
    });

    it("should mark token as used", async () => {
      const now = new Date().toISOString();
      const updated = await modifyRefreshById(
        {
          used_at: now,
          is_active: false,
        },
        getRefreshUuid(1),
        client
      );

      expect(updated.used_at).toBeDefined();
      expect(updated.is_active).toBe(false);
    });
  });

  describe("removeRefreshById", () => {
    it("should delete a refresh token", async () => {
      const newRefresh = {
        role_id: getUserUuid(1),
        role_type: "user",
      };

      const createdRefresh = await addRefresh(newRefresh);

      const refreshId = createdRefresh.refresh_id;

      await removeRefreshById(refreshId);

      // Verify token is deleted
      await expect(fetchRefreshById(refreshId)).rejects.toMatchObject({
        status: 404,
        msg: "Refresh token not found",
      });
    });

    it("should throw error when deleting non-existent token", async () => {
      await expect(removeRefreshById(getUserUuid(2))).rejects.toMatchObject({
        status: 404,
        msg: "Refresh token not found",
      });
    });
  });

  describe("createAccessToken", () => {
    it("should create access token from valid refresh token", async () => {
      // Create a real JWT for token ID 1 (active valid token)
      const validRefreshToken = jwt.sign(
        { refresh_id: getRefreshUuid(1), role_type: "user" },
        process.env.REFRESH_KEY!,
        { expiresIn: "200d" }
      );

      // Update the token hash to match our generated token
      const tokenHash = determinateHash(validRefreshToken);
      await db.query(
        "UPDATE refresh SET token_hash = $1 WHERE refresh_id = $2",
        [tokenHash, getRefreshUuid(1)]
      );

      const decoded = jwt.verify(
        validRefreshToken,
        process.env.REFRESH_KEY!
      ) as any;

      const result = await createAccessToken(decoded, validRefreshToken);

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.newRefreshToken).toBeDefined();

      // Verify the old refresh token was marked as used
      const oldToken = await fetchRefreshById(getRefreshUuid(1));
      expect(oldToken.is_active).toBe(false);
      expect(oldToken.used_at).not.toBeNull();
    });

    it("should throw error for already used refresh token", async () => {
      // Token ID 2 is already used in our test data
      const usedToken = jwt.sign(
        { refresh_id: 2, role_type: "user" },
        process.env.REFRESH_KEY!,
        { expiresIn: "200d" }
      );

      const tokenHash = determinateHash(usedToken);
      await db.query(
        "UPDATE refresh SET token_hash = $1 WHERE refresh_id = $2",
        [tokenHash, getRefreshUuid(2)]
      );

      const decoded = jwt.verify(usedToken, process.env.REFRESH_KEY!) as any;

      await expect(createAccessToken(decoded, usedToken)).rejects.toMatchObject(
        {
          status: 401,
          msg: "Refresh token has already been used - possible security breach",
        }
      );
    });

    it("should throw error for expired refresh token", async () => {
      // Token ID 3 is expired in our test data
      const expiredToken = jwt.sign(
        { refresh_id: 3, role_type: "user" },
        process.env.REFRESH_KEY!,
        { expiresIn: "200d" }
      );

      const tokenHash = determinateHash(expiredToken);
      await db.query(
        "UPDATE refresh SET token_hash = $1 WHERE refresh_id = $2",
        [tokenHash, getRefreshUuid(3)]
      );

      const decoded = jwt.verify(expiredToken, process.env.REFRESH_KEY!) as any;

      await expect(
        createAccessToken(decoded, expiredToken)
      ).rejects.toMatchObject({
        status: 401,
        msg: "Refresh token has expired",
      });
    });

    it("should throw error for revoked refresh token", async () => {
      // Token ID 4 is revoked in our test data
      const revokedToken = jwt.sign(
        { refresh_id: 4, role_type: "user" },
        process.env.REFRESH_KEY!,
        { expiresIn: "200d" }
      );

      const tokenHash = determinateHash(revokedToken);
      await db.query(
        "UPDATE refresh SET token_hash = $1 WHERE refresh_id = $2",
        [tokenHash, getRefreshUuid(4)]
      );

      const decoded = jwt.verify(revokedToken, process.env.REFRESH_KEY!) as any;

      await expect(
        createAccessToken(decoded, revokedToken)
      ).rejects.toMatchObject({
        status: 401,
        msg: "Refresh token has been revoked",
      });
    });

    it("should create admin access token with admin key", async () => {
      // Token ID 5 is admin token
      const adminToken = jwt.sign(
        { refresh_id: getRefreshUuid(5), role_type: "admin" },
        process.env.REFRESH_KEY!,
        { expiresIn: "200d" }
      );

      const tokenHash = determinateHash(adminToken);
      await db.query(
        "UPDATE refresh SET token_hash = $1 WHERE refresh_id = $2",
        [tokenHash, getRefreshUuid(5)]
      );

      const decoded = jwt.verify(adminToken, process.env.REFRESH_KEY!) as any;

      const result = await createAccessToken(decoded, adminToken);

      // Verify access token uses admin key
      const accessDecoded = jwt.verify(
        result.accessToken,
        process.env.ADMIN_ACCESS_KEY!
      ) as any;
      expect(accessDecoded.role_id).toBe(getAdminUuid(1));
      expect(accessDecoded.role_type).toBe("admin");
    });
  });

  describe("revokeUserTokens", () => {
    it("should revoke all active tokens for user 3", async () => {
      // Verify both tokens are inactive
      const token6Active = await fetchRefreshById(getRefreshUuid(6));
      const token7Active = await fetchRefreshById(getRefreshUuid(7));

      expect(token6Active.is_active).toBe(true);
      expect(token7Active.is_active).toBe(true);

      // User 3 has tokens with IDs 6 and 7
      const result = await revokeUserTokens(getUserUuid(3), "user");

      expect(result).toBe("2 tokens revoked successfully");

      // Verify both tokens are inactive
      const token6Inactive = await fetchRefreshById(getRefreshUuid(6));
      const token7Inactive = await fetchRefreshById(getRefreshUuid(7));

      expect(token6Inactive.is_active).toBe(false);
      expect(token7Inactive.is_active).toBe(false);
      // change thewm back for a below test...
      await modifyRefreshById({ is_active: true }, getRefreshUuid(6));
      await modifyRefreshById({ is_active: true }, getRefreshUuid(7));
    });

    it("should not affect other users tokens", async () => {
      await revokeUserTokens(getUserUuid(1), "user");

      // User 2's tokens (3 and 4) should be un
      // affected
      const token3 = await fetchRefreshById(getRefreshUuid(3));
      const token4 = await fetchRefreshById(getRefreshUuid(4));

      expect(token3.is_active).toBe(true); // Still active (though expired)
      expect(token4.is_active).toBe(false); // Was already revoked
    });
  });

  describe("revokeRefreshToken", () => {
    it("should revoke a specific active refresh token", async () => {
      const refreshId = getRefreshUuid(7);
      const result = await revokeRefreshToken(refreshId);

      expect(result).toBe("Token revoked successfully");

      const token = await fetchRefreshById(refreshId);
      expect(token.is_active).toBe(false);
      // set is as active again for the next test
      await modifyRefreshById({ is_active: true }, refreshId);
    });

    it("should return appropriate message for already inactive token", async () => {
      // Token 2 is already inactive
      const result = await revokeRefreshToken(getRefreshUuid(2));
      expect(result).toBe("No active token found to revoke");
    });

    it("should only affect the specified token", async () => {
      await revokeRefreshToken(getRefreshUuid(6));

      const token3 = await fetchRefreshById(getRefreshUuid(6));
      const token10 = await fetchRefreshById(getRefreshUuid(7));

      expect(token3.is_active).toBe(false);
      expect(token10.is_active).toBe(true); // Other token for same user unaffected
    });
  });

  describe("Edge cases with test data", () => {
    it("should handle token about to expire", async () => {
      // Token 8 expires in 1 minute
      const token = await fetchRefreshById(getRefreshUuid(8));
      const expirationTime = new Date(token.expiration_time!);
      const now = new Date();

      const timeDiff = expirationTime.getTime() - now.getTime();
      expect(timeDiff).toBeGreaterThan(0); // Not expired yet
      expect(timeDiff).toBeLessThan(120000); // Less than 2 minutes
    });

    it("should handle replay attack scenario correctly", async () => {
      // Create a fresh token for user 1
      const freshToken = await addRefresh({
        role_id: getUserUuid(2),
        role_type: "user",
      });

      const decoded = jwt.verify(
        freshToken.token,
        process.env.REFRESH_KEY!
      ) as any;

      // First use should succeed
      await createAccessToken(decoded, freshToken.token);

      // Second use should fail and revoke all user tokens
      await expect(
        createAccessToken(decoded, freshToken.token)
      ).rejects.toMatchObject({
        status: 401,
        msg: "Refresh token has already been used - possible security breach",
      });

      // Check that all tokens for user 1 are revoked
      const tokens = await db.query(
        "SELECT * FROM refresh WHERE role_id = $1 AND role_type = $2",
        [getUserUuid(2), "user"]
      );

      tokens.rows.forEach((token) => {
        expect(token.is_active).toBe(false);
      });
    });
  });

  describe("Transaction handling", () => {
    it("should support transactions for addRefresh", async () => {
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const refresh = await addRefresh(
          {
            role_id: getUserUuid(1),
            role_type: "user",
          },
          client
        );

        expect(refresh.refresh_id).toBeDefined();

        await client.query("ROLLBACK");

        // Token should not exist after rollback
        await expect(
          fetchRefreshById(refresh.refresh_id)
        ).rejects.toMatchObject({
          status: 404,
          msg: "Refresh token not found",
        });
      } finally {
        client.release();
      }
    });

    it("should support transactions for modifyRefreshById", async () => {
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const modified = await modifyRefreshById(
          { is_active: true },
          getRefreshUuid(1),
          client
        );

        expect(modified.is_active).toBe(true);

        await client.query("ROLLBACK");

        const token = await fetchRefreshById(getRefreshUuid(1));
        expect(token.is_active).toBe(false); // Still false  after rollback
      } finally {
        client.release();
      }
    });
  });
});
