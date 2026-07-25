import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  createUser,
  getUser,
  getUserById,
  getUsers,
  modifyUser,
  deleteUser,
  activateUser,
  deactivateUser,
  verifyUserEmail,
  updatePassword,
  getUserWithPassword,
  getUserStats,
} from "../../src/models/users.models";
import { testUsers } from "../../src/database/test-data";
import { getUserUuid } from "../../src/database/test-data/testUuids";

describe("User Model CRUD Operations", () => {
  beforeAll(async () => {
    await seed({ usersData: testUsers });
  });

  afterAll(() => {
    db.end();
  });

  describe("createUser", () => {
    it("should create a new user with all fields", async () => {
      const newUser = {
        email: "newuser@example.com",
        password_hash: "hashed_password_123",
        email_verified: true,
        is_active: true,
      };

      const createdUser = await createUser(newUser);

      expect(createdUser).toBeDefined();
      expect(createdUser.user_id).toBeDefined();
      expect(createdUser.email).toBe(newUser.email);
      expect(createdUser.email_verified).toBe(newUser.email_verified);
      expect(createdUser.is_active).toBe(newUser.is_active);
      expect(createdUser.deleted_at).toBeNull();
      expect(createdUser.deactivated_at).toBeNull();
      expect(createdUser.created_at).toBeInstanceOf(Date);
      expect(createdUser.updated_at).toBeInstanceOf(Date);
      expect("password_hash" in createdUser).toBe(false);
    });

    it("should create a user with only required fields", async () => {
      const minimalUser = {
        email: "minimal@example.com",
        password_hash: "minimal_hash",
      };

      const createdUser = await createUser(minimalUser);

      expect(createdUser.email).toBe(minimalUser.email);
      expect(createdUser.email_verified).toBe(false); // default
      expect(createdUser.is_active).toBe(true); // default
      expect("password_hash" in createdUser).toBe(false);
    });

    it("should throw error when creating user with duplicate email", async () => {
      await expect(
        createUser({
          email: "test@example.com",
          password_hash: "some_hash",
        }),
      ).rejects.toMatchObject({
        status: 409,
        msg: "Email already exists",
      });
    });

    it("should throw error when email is missing", async () => {
      await expect(
        createUser({
          email: "",
          password_hash: "some_hash",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Email and password_hash are required",
      });
    });

    it("should throw error when password_hash is missing", async () => {
      await expect(
        createUser({
          email: "test@example.com",
          password_hash: "",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Email and password_hash are required",
      });
    });
  });

  describe("getUser", () => {
    it("should find user by email without password hash", async () => {
      const user = await getUser("test@example.com");

      expect(user).toBeDefined();
      expect(user!.email).toBe("test@example.com");
      expect(user!.email_verified).toBe(true);
      expect(user!.is_active).toBe(true);
      expect("password_hash" in user!).toBe(false);
    });

    it("should return null for non-existent email", async () => {
      const user = await getUser("nonexistent@example.com");
      expect(user).toBeNull();
    });

    it("should not return soft-deleted users by default", async () => {
      const created = await createUser({
        email: "softdeleted@example.com",
        password_hash: "deleted_hash",
      });

      await deleteUser(created.user_id!);

      const user = await getUser("softdeleted@example.com");
      expect(user).toBeNull();
    });

    it("should return soft-deleted users when includeSoftDeleted is true", async () => {
      const created = await createUser({
        email: "softdeleted2@example.com",
        password_hash: "deleted_hash",
      });

      await deleteUser(created.user_id!);

      const user = await getUser("softdeleted2@example.com", {
        includeSoftDeleted: true,
      });

      expect(user).toBeDefined();
      expect(user!.deleted_at).not.toBeNull();
    });
  });

  describe("getUserById", () => {
    it("should find user by ID without password hash", async () => {
      const testUser = await getUser("test@example.com");
      expect(testUser).not.toBeNull();

      const user = await getUserById(testUser!.user_id!);

      expect(user).toBeDefined();
      expect(user!.user_id).toBe(testUser!.user_id!);
      expect(user!.email).toBe("test@example.com");
      expect("password_hash" in user!).toBe(false);
    });

    it("should return null for non-existent ID", async () => {
      const user = await getUserById("550e8400-e29b-41d4-a716-446655440030");
      expect(user).toBeNull();
    });

    it("should not return soft-deleted users", async () => {
      const created = await createUser({
        email: "deleted-by-id@example.com",
        password_hash: "test_hash",
      });

      await deleteUser(created.user_id!);

      const user = await getUserById(created.user_id!);
      expect(user).toBeNull();
    });
  });

  describe("getUsers", () => {
    it("should return all active users without password hashes", async () => {
      const users = await getUsers({ is_active: true });

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThanOrEqual(2);

      const emails = users.map((u) => u.email);
      expect(emails).toContain("test@example.com");
      expect(emails).toContain("alice@example.com");
      expect(emails).not.toContain("bob@example.com"); // bob is inactive

      users.forEach((user) => {
        expect("password_hash" in user).toBe(false);
      });
    });

    it("should return verified users", async () => {
      const users = await getUsers({ email_verified: true });

      expect(users.length).toBeGreaterThanOrEqual(2);
      users.forEach((user) => {
        expect(user.email_verified).toBe(true);
      });
    });

    it("should support multiple filters", async () => {
      const users = await getUsers({
        is_active: true,
        email_verified: true,
      });

      users.forEach((user) => {
        expect(user.is_active).toBe(true);
        expect(user.email_verified).toBe(true);
        expect(user.deleted_at).toBeNull();
      });
    });

    it("should support pagination", async () => {
      const page1 = await getUsers({}, { limit: 2, offset: 0 });
      const page2 = await getUsers({}, { limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);

      // Ensure no overlap
      const page1Emails = page1.map((u) => u.email);
      const page2Emails = page2.map((u) => u.email);
      const overlap = page1Emails.filter((email) =>
        page2Emails.includes(email),
      );
      expect(overlap.length).toBe(0);
    });

    it("should return users ordered by created_at DESC", async () => {
      const users = await getUsers();

      for (let i = 1; i < users.length; i++) {
        const prevDate = new Date(users[i - 1].created_at!);
        const currDate = new Date(users[i].created_at!);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });
  });

  describe("modifyUser", () => {
    it("should update email verification status", async () => {
      const bobUser = await getUser("bob@example.com");
      expect(bobUser).not.toBeNull();

      const updatedUser = await modifyUser(bobUser!.user_id!, {
        email_verified: true,
      });

      expect(updatedUser.email_verified).toBe(true);
      expect(new Date(updatedUser.updated_at!).getTime()).toBeGreaterThan(
        new Date(bobUser!.updated_at!).getTime(),
      );
    });

    it("should deactivate a user with metadata", async () => {
      const aliceUser = await getUser("alice@example.com");
      expect(aliceUser).not.toBeNull();
      const deactivatorId = getUserUuid(1);

      const updatedUser = await modifyUser(aliceUser!.user_id!, {
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: deactivatorId,
      });

      expect(updatedUser.is_active).toBe(false);
      expect(updatedUser.deactivated_at).toBeInstanceOf(Date);
      expect(updatedUser.deactivated_by).toBe(deactivatorId);
    });

    it("should throw error when trying to update password_hash", async () => {
      const testUser = await getUser("test@example.com");
      expect(testUser).not.toBeNull();

      await expect(
        modifyUser(testUser!.user_id!, {
          password_hash: "should_not_work",
        } as any),
      ).rejects.toMatchObject({
        status: 403,
        msg: "Password updates not allowed. Use updatePassword function instead",
      });
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        modifyUser("550e8400-e29b-41d4-a716-446655440030", {
          email_verified: true,
        }),
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });

    it("should not allow updating to duplicate email", async () => {
      const testUser = await getUser("test@example.com");
      const aliceUser = await getUser("alice@example.com");
      expect(testUser).not.toBeNull();
      expect(aliceUser).not.toBeNull();

      await expect(
        modifyUser(aliceUser!.user_id!, { email: testUser!.email }),
      ).rejects.toMatchObject({
        status: 409,
        msg: "Email already exists",
      });
    });

    it("should update email successfully", async () => {
      const created = await createUser({
        email: "original@example.com",
        password_hash: "test_hash",
      });

      const updated = await modifyUser(created.user_id!, {
        email: "updated@example.com",
      });

      expect(updated.email).toBe("updated@example.com");

      const oldUser = await getUser("original@example.com");
      expect(oldUser).toBeNull();

      const newUser = await getUser("updated@example.com");
      expect(newUser).not.toBeNull();
    });
  });

  describe("deleteUser", () => {
    it("should soft delete a user", async () => {
      const created = await createUser({
        email: "todelete@example.com",
        password_hash: "delete_hash",
      });

      const deletedUser = await deleteUser(created.user_id!);

      expect(deletedUser.deleted_at).toBeInstanceOf(Date);

      // Verify user can't be found with regular getUser
      const foundUser = await getUser("todelete@example.com");
      expect(foundUser).toBeNull();
    });

    it("should throw error when deleting non-existent user", async () => {
      await expect(
        deleteUser("550e8400-e29b-41d4-a716-446655440030"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });

    it("should throw error when deleting already deleted user", async () => {
      const created = await createUser({
        email: "doubledelete@example.com",
        password_hash: "delete_hash",
      });

      await deleteUser(created.user_id!);

      await expect(deleteUser(created.user_id!)).rejects.toMatchObject({
        status: 409,
        msg: "User already deleted",
      });
    });
  });

  describe("activateUser", () => {
    it("should activate an inactive user", async () => {
      const bobUser = await getUser("bob@example.com");
      expect(bobUser).not.toBeNull();

      const activatedUser = await activateUser(bobUser!.user_id!);

      expect(activatedUser.is_active).toBe(true);
      expect(activatedUser.deactivated_at).toBeNull();
      expect(activatedUser.deactivated_by).toBeNull();
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        activateUser("550e8400-e29b-41d4-a716-446655440030"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });
  });

  describe("deactivateUser", () => {
    it("should deactivate an active user", async () => {
      const testUser = await getUser("test@example.com");
      expect(testUser).not.toBeNull();
      const deactivatorId = getUserUuid(1);

      const deactivatedUser = await deactivateUser(
        testUser!.user_id!,
        deactivatorId,
      );

      expect(deactivatedUser.is_active).toBe(false);
      expect(deactivatedUser.deactivated_at).toBeInstanceOf(Date);
      expect(deactivatedUser.deactivated_by).toBe(deactivatorId);
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        deactivateUser("550e8400-e29b-41d4-a716-446655440030", getUserUuid(1)),
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });
  });

  describe("verifyUserEmail", () => {
    it("should verify user email", async () => {
      const bobUser = await getUser("bob@example.com");
      expect(bobUser).not.toBeNull();

      const verifiedUser = await verifyUserEmail(bobUser!.user_id!);

      expect(verifiedUser.email_verified).toBe(true);
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        verifyUserEmail("550e8400-e29b-41d4-a716-446655440030"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });
  });

  describe("updatePassword", () => {
    it("should update user password", async () => {
      const testUser = await getUser("test@example.com");
      expect(testUser).not.toBeNull();
      const newPasswordHash = "new_secure_hash_789";

      const result = await updatePassword(testUser!.user_id!, newPasswordHash);

      expect(result).toBe(true);

      // Verify password was actually updated by fetching with password
      const userWithPassword = await getUserWithPassword("test@example.com");
      expect(userWithPassword).not.toBeNull();
      expect(userWithPassword!.password_hash).toBe(newPasswordHash);
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        updatePassword("550e8400-e29b-41d4-a716-446655440030", "new_hash"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "User not found",
      });
    });

    it("should not return password hash after update", async () => {
      const testUser = await getUser("test@example.com");
      expect(testUser).not.toBeNull();
      const newPasswordHash = "another_secure_hash";

      await updatePassword(testUser!.user_id!, newPasswordHash);

      // Fetch user again to ensure password_hash is not exposed
      const updatedUser = await getUserById(testUser!.user_id!);
      expect(updatedUser).not.toBeNull();
      expect("password_hash" in updatedUser!).toBe(false);
    });
  });

  describe("getUserWithPassword", () => {
    it("should return user with password hash when explicitly requested", async () => {
      const userWithPassword = await getUserWithPassword("test@example.com");

      expect(userWithPassword).toBeDefined();
      expect(userWithPassword!.email).toBe("test@example.com");
      expect(userWithPassword!.password_hash).toBeDefined();
      expect(typeof userWithPassword!.password_hash).toBe("string");
    });

    it("should return null for non-existent user", async () => {
      const user = await getUserWithPassword("nonexistent@example.com");
      expect(user).toBeNull();
    });

    it("should not return soft-deleted users", async () => {
      const created = await createUser({
        email: "authtest@example.com",
        password_hash: "auth_hash",
      });

      await deleteUser(created.user_id!);

      const user = await getUserWithPassword("authtest@example.com");
      expect(user).toBeNull();
    });
  });

  describe("getUserStats", () => {
    it("should return user statistics", async () => {
      const stats = await getUserStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("active");
      expect(stats).toHaveProperty("inactive");
      expect(stats).toHaveProperty("verified");
      expect(stats).toHaveProperty("unverified");
      expect(stats).toHaveProperty("deleted");

      expect(typeof stats.total).toBe("number");
      expect(typeof stats.active).toBe("number");
      expect(typeof stats.inactive).toBe("number");
      expect(typeof stats.verified).toBe("number");
      expect(typeof stats.unverified).toBe("number");
      expect(typeof stats.deleted).toBe("number");

      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.active).toBeGreaterThanOrEqual(2);
      expect(stats.inactive).toBeGreaterThanOrEqual(1);
      expect(stats.verified).toBeGreaterThanOrEqual(2);
      expect(stats.unverified).toBeGreaterThanOrEqual(1);
    });

    it("should have consistent statistics", async () => {
      const stats = await getUserStats();

      // Active + inactive should equal total (excluding deleted)
      expect(stats.active + stats.inactive).toBe(stats.total - stats.deleted);

      // Verified + unverified should equal total non-deleted
      expect(stats.verified + stats.unverified).toBe(
        stats.total - stats.deleted,
      );
    });
  });

  describe("Transaction handling", () => {
    it("should support transactions for createUser", async () => {
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const user = await createUser(
          {
            email: "transaction@example.com",
            password_hash: "tx_hash",
          },
          client,
        );

        expect(user.email).toBe("transaction@example.com");

        await client.query("ROLLBACK");

        // User should not exist after rollback
        const foundUser = await getUser("transaction@example.com");
        expect(foundUser).toBeNull();
      } finally {
        client.release();
      }
    });

    it("should support transactions for modifyUser", async () => {
      const client = await db.connect();
      const testUser = await getUser("test@example.com");
      expect(testUser).not.toBeNull();

      try {
        await client.query("BEGIN");

        const modified = await modifyUser(
          testUser!.user_id!,
          {
            email_verified: false,
          },
          client,
        );

        expect(modified.email_verified).toBe(false);

        await client.query("ROLLBACK");

        const foundUser = await getUser("test@example.com");
        expect(foundUser!.email_verified).toBe(true);
      } finally {
        client.release();
      }
    });
  });
});
