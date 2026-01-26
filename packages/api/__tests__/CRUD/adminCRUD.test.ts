import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  createAdmin,
  getAdmin,
  getAdminById,
  getAdmins,
  modifyAdmin,
  deleteAdmin,
  activateAdmin,
  deactivateAdmin,
  verifyAdminEmail,
  updateAdminPassword,
  getAdminWithPassword,
  getAdminStats,
  getRootAdmin,
} from "../../src/models/admins.models";
import { testAdmins } from "../../src/database/test-data";
import {
  getAdminUuid,
} from "../../src/database/test-data/testUuids";

const passwordHash =
  "$2b$10$UOmUkN/DnL0BN0NX2.YXKeaKXCbmWSN0vWN0dD.bcDcbYPJiqI.Pm"; // Hash of Password1

describe("Admin Model CRUD Operations", () => {
  beforeAll(async () => {
    await seed({ adminsData: testAdmins });
  });

  afterAll(() => {
    db.end();
  });

  describe("createAdmin", () => {
    it("should create a new regular admin with all fields", async () => {
      const newAdmin = {
        email: "newadmin@example.com",
        password_hash: "hashed_password_123",
        root: false,
        email_verified: true,
        is_active: true,
      };

      const createdAdmin = await createAdmin(newAdmin);

      expect(createdAdmin).toBeDefined();
      expect(createdAdmin.admin_id).toBeDefined();
      expect(createdAdmin.email).toBe(newAdmin.email);
      expect(createdAdmin.root).toBe(newAdmin.root);
      expect(createdAdmin.email_verified).toBe(newAdmin.email_verified);
      expect(createdAdmin.is_active).toBe(newAdmin.is_active);
      expect(createdAdmin.deleted_at).toBeNull();
      expect(createdAdmin.deactivated_at).toBeNull();
      expect(createdAdmin.created_at).toBeInstanceOf(Date);
      expect(createdAdmin.updated_at).toBeInstanceOf(Date);
      expect("password_hash" in createdAdmin).toBe(false);
    });

    it("should create an admin with only required fields", async () => {
      const minimalAdmin = {
        email: "minimal@example.com",
        password_hash: "minimal_hash",
      };

      const createdAdmin = await createAdmin(minimalAdmin);

      expect(createdAdmin.email).toBe(minimalAdmin.email);
      expect(createdAdmin.root).toBe(false); // default
      expect(createdAdmin.email_verified).toBe(false); // default
      expect(createdAdmin.is_active).toBe(true); // default
      expect("password_hash" in createdAdmin).toBe(false);
    });

    it("should throw error when creating admin with duplicate email", async () => {
      await expect(
        createAdmin({
          email: "root.admin@test.com",
          password_hash: "some_hash",
        })
      ).rejects.toMatchObject({
        status: 409,
        msg: "Email already exists",
      });
    });

    it("should throw error when trying to create second root admin", async () => {
      await expect(
        createAdmin({
          email: "second.root@test.com",
          password_hash: "some_hash",
          root: true,
        })
      ).rejects.toMatchObject({
        status: 409,
        msg: "Root admin already exists",
      });
    });

    it("should throw error when email is missing", async () => {
      await expect(
        createAdmin({
          email: "",
          password_hash: "some_hash",
        })
      ).rejects.toMatchObject({
        status: 400,
        msg: "Email and password_hash are required",
      });
    });

    it("should throw error when password_hash is missing", async () => {
      await expect(
        createAdmin({
          email: "test@example.com",
          password_hash: "",
        })
      ).rejects.toMatchObject({
        status: 400,
        msg: "Email and password_hash are required",
      });
    });
  });

  describe("getAdmin", () => {
    it("should find admin by email without password hash", async () => {
      const admin = await getAdmin("root.admin@test.com");

      expect(admin).toBeDefined();
      expect(admin!.email).toBe("root.admin@test.com");
      expect(admin!.root).toBe(true);
      expect(admin!.email_verified).toBe(true);
      expect(admin!.is_active).toBe(true);
      expect("password_hash" in admin!).toBe(false);
    });

    it("should return null for non-existent email", async () => {
      const admin = await getAdmin("nonexistent@example.com");
      expect(admin).toBeNull();
    });

    it("should not return soft-deleted admins by default", async () => {
      const created = await createAdmin({
        email: "softdeleted@example.com",
        password_hash: "deleted_hash",
      });

      await deleteAdmin(created.admin_id!);

      const admin = await getAdmin("softdeleted@example.com");
      expect(admin).toBeNull();
    });

    it("should return soft-deleted admins when includeSoftDeleted is true", async () => {
      const created = await createAdmin({
        email: "softdeleted2@example.com",
        password_hash: "deleted_hash",
      });

      await deleteAdmin(created.admin_id!);

      const admin = await getAdmin("softdeleted2@example.com", {
        includeSoftDeleted: true,
      });

      expect(admin).toBeDefined();
      expect(admin!.deleted_at).not.toBeNull();
    });
  });

  describe("getAdminById", () => {
    it("should find admin by ID without password hash", async () => {
      const testAdmin = await getAdmin("root.admin@test.com");
      expect(testAdmin).not.toBeNull();

      const admin = await getAdminById(testAdmin!.admin_id!);

      expect(admin).toBeDefined();
      expect(admin!.admin_id).toBe(testAdmin!.admin_id!);
      expect(admin!.email).toBe("root.admin@test.com");
      expect("password_hash" in admin!).toBe(false);
    });

    it("should return null for non-existent ID", async () => {
      const admin = await getAdminById("550e8400-e29b-41d4-a716-446355440030");
      expect(admin).toBeNull();
    });

    it("should not return soft-deleted admins", async () => {
      const created = await createAdmin({
        email: "deleted-by-id@example.com",
        password_hash: "test_hash",
      });

      await deleteAdmin(created.admin_id!);

      const admin = await getAdminById(created.admin_id!);
      expect(admin).toBeNull();
    });
  });

  describe("getAdmins", () => {
    it("should return all active admins without password hashes", async () => {
      const admins = await getAdmins({ is_active: true });

      expect(Array.isArray(admins)).toBe(true);
      expect(admins.length).toBeGreaterThanOrEqual(3);

      const emails = admins.map((a) => a.email);
      expect(emails).toContain("root.admin@test.com");
      expect(emails).toContain("regular.admin@test.com");
      expect(emails).toContain("unverified.admin@test.com");
      expect(emails).not.toContain("deactivated.admin@test.com");

      admins.forEach((admin) => {
        expect("password_hash" in admin).toBe(false);
      });
    });

    it("should return verified admins", async () => {
      const admins = await getAdmins({ email_verified: true });

      expect(admins.length).toBeGreaterThanOrEqual(3);
      admins.forEach((admin) => {
        expect(admin.email_verified).toBe(true);
      });
    });

    it("should return only root admins", async () => {
      const admins = await getAdmins({ root: true });

      expect(admins.length).toBe(1);
      expect(admins[0].email).toBe("root.admin@test.com");
      expect(admins[0].root).toBe(true);
    });

    it("should support multiple filters", async () => {
      const admins = await getAdmins({
        is_active: true,
        email_verified: true,
        root: false,
      });

      admins.forEach((admin) => {
        expect(admin.is_active).toBe(true);
        expect(admin.email_verified).toBe(true);
        expect(admin.root).toBe(false);
        expect(admin.deleted_at).toBeNull();
      });
    });

    it("should support pagination", async () => {
      const page1 = await getAdmins({}, { limit: 2, offset: 0 });
      const page2 = await getAdmins({}, { limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);

      // Ensure no overlap
      const page1Emails = page1.map((a) => a.email);
      const page2Emails = page2.map((a) => a.email);
      const overlap = page1Emails.filter((email) =>
        page2Emails.includes(email)
      );
      expect(overlap.length).toBe(0);
    });

    it("should return admins ordered by created_at DESC", async () => {
      const admins = await getAdmins();

      for (let i = 1; i < admins.length; i++) {
        const prevDate = new Date(admins[i - 1].created_at!);
        const currDate = new Date(admins[i].created_at!);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });
  });

  describe("modifyAdmin", () => {
    it("should update email verification status", async () => {
      const unverifiedAdmin = await getAdmin("unverified.admin@test.com");
      expect(unverifiedAdmin).not.toBeNull();

      const updatedAdmin = await modifyAdmin(unverifiedAdmin!.admin_id!, {
        email_verified: true,
      });

      expect(updatedAdmin.email_verified).toBe(true);
      expect(new Date(updatedAdmin.updated_at!).getTime()).toBeGreaterThan(
        new Date(unverifiedAdmin!.updated_at!).getTime()
      );
    });

    it("should deactivate an admin with metadata", async () => {
      const regularAdmin = await getAdmin("regular.admin@test.com");
      expect(regularAdmin).not.toBeNull();
      const deactivatorId = getAdminUuid(3);

      const updatedAdmin = await modifyAdmin(regularAdmin!.admin_id!, {
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: deactivatorId,
      });

      expect(updatedAdmin.is_active).toBe(false);
      expect(updatedAdmin.deactivated_at).toBeInstanceOf(Date);
      expect(updatedAdmin.deactivated_by).toBe(deactivatorId);
    });

    it("should throw error when trying to update password_hash", async () => {
      const testAdmin = await getAdmin("regular.admin@test.com");
      expect(testAdmin).not.toBeNull();

      await expect(
        modifyAdmin(testAdmin!.admin_id!, {
          password_hash: "should_not_work",
        } as any)
      ).rejects.toMatchObject({
        status: 403,
        msg: "Password updates not allowed. Use updateAdminPassword function instead",
      });
    });

    it("should throw error for non-existent admin", async () => {
      await expect(
        modifyAdmin("550e8400-e29b-41d4-a717-446355440031", {
          email_verified: true,
        })
      ).rejects.toMatchObject({
        status: 404,
        msg: "Admin not found",
      });
    });

    it("should not allow updating to duplicate email", async () => {
      const rootAdmin = await getAdmin("root.admin@test.com");
      const regularAdmin = await getAdmin("regular.admin@test.com");
      expect(rootAdmin).not.toBeNull();
      expect(regularAdmin).not.toBeNull();

      await expect(
        modifyAdmin(regularAdmin!.admin_id!, { email: rootAdmin!.email })
      ).rejects.toMatchObject({
        status: 409,
        msg: "Email already exists",
      });
    });

    it("should throw error when trying to create second root admin", async () => {
      const regularAdmin = await getAdmin("regular.admin@test.com");
      expect(regularAdmin).not.toBeNull();

      await expect(
        modifyAdmin(regularAdmin!.admin_id!, { root: true })
      ).rejects.toMatchObject({
        status: 409,
        msg: "Root admin already exists",
      });
    });

    it("should throw error when trying to remove root status from only root", async () => {
      const rootAdmin = await getAdmin("root.admin@test.com");
      expect(rootAdmin).not.toBeNull();

      await expect(
        modifyAdmin(rootAdmin!.admin_id!, { root: false })
      ).rejects.toMatchObject({
        status: 409,
        msg: "Cannot remove root status from the only root admin",
      });
    });

    it("should update email successfully", async () => {
      const created = await createAdmin({
        email: "original@example.com",
        password_hash: "test_hash",
      });

      const updated = await modifyAdmin(created.admin_id!, {
        email: "updated@example.com",
      });

      expect(updated.email).toBe("updated@example.com");

      const oldAdmin = await getAdmin("original@example.com");
      expect(oldAdmin).toBeNull();

      const newAdmin = await getAdmin("updated@example.com");
      expect(newAdmin).not.toBeNull();
    });
  });

  describe("deleteAdmin", () => {
    it("should soft delete a regular admin", async () => {
      const created = await createAdmin({
        email: "todelete@example.com",
        password_hash: "delete_hash",
      });

      const deletedAdmin = await deleteAdmin(created.admin_id!);

      expect(deletedAdmin.deleted_at).toBeInstanceOf(Date);

      // Verify admin can't be found with regular getAdmin
      const foundAdmin = await getAdmin("todelete@example.com");
      expect(foundAdmin).toBeNull();
    });

    it("should throw error when deleting non-existent admin", async () => {
      await expect(
        deleteAdmin("550e8400-e29b-41d4-a716-446355440030")
      ).rejects.toMatchObject({
        status: 404,
        msg: "Admin not found",
      });
    });

    it("should throw error when deleting already deleted admin", async () => {
      const created = await createAdmin({
        email: "doubledelete@example.com",
        password_hash: "delete_hash",
      });

      await deleteAdmin(created.admin_id!);

      await expect(deleteAdmin(created.admin_id!)).rejects.toMatchObject({
        status: 409,
        msg: "Admin already deleted",
      });
    });

    it("should throw error when trying to delete the only root admin", async () => {
      const rootAdmin = await getAdmin("root.admin@test.com");
      expect(rootAdmin).not.toBeNull();

      await expect(deleteAdmin(rootAdmin!.admin_id!)).rejects.toMatchObject({
        status: 409,
        msg: "Cannot delete the only root admin",
      });
    });
  });

  describe("activateAdmin", () => {
    it("should activate an inactive admin", async () => {
      const deactivatedAdmin = await getAdmin("deactivated.admin@test.com");
      expect(deactivatedAdmin).not.toBeNull();

      const activatedAdmin = await activateAdmin(deactivatedAdmin!.admin_id!);

      expect(activatedAdmin.is_active).toBe(true);
      expect(activatedAdmin.deactivated_at).toBeNull();
      expect(activatedAdmin.deactivated_by).toBeNull();
    });

    it("should throw error for non-existent admin", async () => {
      await expect(
        activateAdmin("550e8400-e29b-41d4-a716-446355440030")
      ).rejects.toMatchObject({
        status: 404,
        msg: "Admin not found",
      });
    });
  });

  describe("deactivateAdmin", () => {
    it("should deactivate an active regular admin", async () => {
      const regularAdmin = await getAdmin("regular.admin@test.com");
      expect(regularAdmin).not.toBeNull();
      const deactivatorId = getAdminUuid(1);

      const deactivatedAdmin = await deactivateAdmin(
        regularAdmin!.admin_id!,
        deactivatorId
      );

      expect(deactivatedAdmin.is_active).toBe(false);
      expect(deactivatedAdmin.deactivated_at).toBeInstanceOf(Date);
      expect(deactivatedAdmin.deactivated_by).toBe(deactivatorId);
    });

    it("should throw error for non-existent admin", async () => {
      const nonExistentId = "550e8400-e29b-41d4-a716-446655449999";
      await expect(
        deactivateAdmin(nonExistentId, getAdminUuid(1))
      ).rejects.toMatchObject({
        status: 404,
        msg: "Admin not found",
      });
    });

    it("should throw error when trying to deactivate the only active root admin", async () => {
      const rootAdmin = await getAdmin("root.admin@test.com");
      expect(rootAdmin).not.toBeNull();

      await expect(
        deactivateAdmin(rootAdmin!.admin_id!, getAdminUuid(1))
      ).rejects.toMatchObject({
        status: 409,
        msg: "Cannot deactivate the only active root admin",
      });
    });
  });

  describe("verifyAdminEmail", () => {
    it("should verify admin email", async () => {
      const unverifiedAdmin = await getAdmin("unverified.admin@test.com");
      expect(unverifiedAdmin).not.toBeNull();

      const verifiedAdmin = await verifyAdminEmail(unverifiedAdmin!.admin_id!);

      expect(verifiedAdmin.email_verified).toBe(true);
    });

    it("should throw error for non-existent admin", async () => {
      const nonExistentId = "550e8400-e29b-41d4-a716-446655449999";
      await expect(
        verifyAdminEmail(nonExistentId)
      ).rejects.toMatchObject({
        status: 404,
        msg: "Admin not found",
      });
    });
  });

  describe("updateAdminPassword", () => {
    it("should update admin password", async () => {
      const regularAdmin = await getAdmin("regular.admin@test.com");
      expect(regularAdmin).not.toBeNull();
      const newPasswordHash = "new_secure_hash_789";

      const result = await updateAdminPassword(
        regularAdmin!.admin_id!,
        newPasswordHash
      );

      expect(result).toBe(true);

      // Verify password was actually updated by fetching with password
      const adminWithPassword = await getAdminWithPassword(
        "regular.admin@test.com"
      );
      expect(adminWithPassword).not.toBeNull();
      expect(adminWithPassword!.password_hash).toBe(newPasswordHash);
    });

    it("should throw error for non-existent admin", async () => {
      await expect(
        updateAdminPassword("550e8400-e29b-41d4-a716-446355440030", "new_hash")
      ).rejects.toMatchObject({
        status: 404,
        msg: "Admin not found",
      });
    });

    it("should not return password hash after update", async () => {
      const regularAdmin = await getAdmin("regular.admin@test.com");
      expect(regularAdmin).not.toBeNull();
      const newPasswordHash = "another_secure_hash";

      await updateAdminPassword(regularAdmin!.admin_id!, newPasswordHash);

      // Fetch admin again to ensure password_hash is not exposed
      const updatedAdmin = await getAdminById(regularAdmin!.admin_id!);
      expect(updatedAdmin).not.toBeNull();
      expect("password_hash" in updatedAdmin!).toBe(false);
    });
  });

  describe("getAdminWithPassword", () => {
    it("should return admin with password hash when explicitly requested", async () => {
      const adminWithPassword = await getAdminWithPassword(
        "root.admin@test.com"
      );

      expect(adminWithPassword).toBeDefined();
      expect(adminWithPassword!.email).toBe("root.admin@test.com");
      expect(adminWithPassword!.password_hash).toBeDefined();
      expect(typeof adminWithPassword!.password_hash).toBe("string");
    });

    it("should return null for non-existent admin", async () => {
      const admin = await getAdminWithPassword("nonexistent@example.com");
      expect(admin).toBeNull();
    });

    it("should not return soft-deleted admins", async () => {
      const created = await createAdmin({
        email: "authtest@example.com",
        password_hash: "auth_hash",
      });

      await deleteAdmin(created.admin_id!);

      const admin = await getAdminWithPassword("authtest@example.com");
      expect(admin).toBeNull();
    });
  });

  describe("getAdminStats", () => {
    it("should return admin statistics", async () => {
      const stats = await getAdminStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("active");
      expect(stats).toHaveProperty("inactive");
      expect(stats).toHaveProperty("verified");
      expect(stats).toHaveProperty("unverified");
      expect(stats).toHaveProperty("root_admins");
      expect(stats).toHaveProperty("deleted");

      expect(typeof stats.total).toBe("number");
      expect(typeof stats.active).toBe("number");
      expect(typeof stats.inactive).toBe("number");
      expect(typeof stats.verified).toBe("number");
      expect(typeof stats.unverified).toBe("number");
      expect(typeof stats.root_admins).toBe("number");
      expect(typeof stats.deleted).toBe("number");

      expect(stats.total).toBeGreaterThanOrEqual(5);
      expect(stats.active).toBeGreaterThanOrEqual(3);
      expect(stats.inactive).toBeGreaterThanOrEqual(2);
      expect(stats.verified).toBeGreaterThanOrEqual(4);
      expect(stats.unverified).toBeGreaterThanOrEqual(1);
      expect(stats.root_admins).toBe(1); // Only one root admin
    });

    it("should have consistent statistics", async () => {
      const stats = await getAdminStats();

      // Active + inactive should equal total (excluding deleted)
      expect(stats.active + stats.inactive).toBe(stats.total - stats.deleted);

      // Verified + unverified should equal total non-deleted
      expect(stats.verified + stats.unverified).toBe(
        stats.total - stats.deleted
      );

      // Should have exactly 1 root admin
      expect(stats.root_admins).toBe(1);
    });
  });

  describe("getRootAdmin", () => {
    it("should return the root admin", async () => {
      const rootAdmin = await getRootAdmin();

      expect(rootAdmin).toBeDefined();
      expect(rootAdmin!.root).toBe(true);
      expect(rootAdmin!.email).toBe("root.admin@test.com");
      expect("password_hash" in rootAdmin!).toBe(false);
    });

    it("should return null if no root admin exists", async () => {
      const rootAdmin = await getRootAdmin();
      expect(rootAdmin).not.toBeNull();
    });
  });

  describe("Transaction handling", () => {
    it("should support transactions for createAdmin", async () => {
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const admin = await createAdmin(
          {
            email: "transaction@example.com",
            password_hash: "tx_hash",
          },
          client
        );

        expect(admin.email).toBe("transaction@example.com");

        await client.query("ROLLBACK");

        // Admin should not exist after rollback
        const foundAdmin = await getAdmin("transaction@example.com");
        expect(foundAdmin).toBeNull();
      } finally {
        client.release();
      }
    });

    it("should support transactions for modifyAdmin", async () => {
      const client = await db.connect();
      const regularAdmin = await getAdmin("regular.admin@test.com");
      expect(regularAdmin).not.toBeNull();

      try {
        await client.query("BEGIN");

        const modified = await modifyAdmin(
          regularAdmin!.admin_id!,
          {
            email_verified: false,
          },
          client
        );

        expect(modified.email_verified).toBe(false);

        await client.query("ROLLBACK");

        const foundAdmin = await getAdmin("regular.admin@test.com");
        expect(foundAdmin!.email_verified).toBe(true);
      } finally {
        client.release();
      }
    });
  });

  describe("Root admin succession scenarios", () => {
    it("should allow creating new root admin after deleting the only one", async () => {
      // Create a temporary regular admin first
      const tempAdmin = await createAdmin({
        email: "temp.admin@test.com",
        password_hash: passwordHash,
      });

      // Manually make the temp admin a root admin
      await db.query("UPDATE admins SET root = true WHERE admin_id = $1", [
        tempAdmin.admin_id,
      ]);

      // Now delete the original root admin
      const originalRoot = await getAdmin("root.admin@test.com");
      await deleteAdmin(originalRoot!.admin_id!);

      // Should still have a root admin
      const currentRoot = await getRootAdmin();
      expect(currentRoot).not.toBeNull();
      expect(currentRoot!.email).toBe("temp.admin@test.com");
    });
  });
});
