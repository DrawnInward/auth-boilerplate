import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  getOrganizations,
  getOrganizationsByUserId,
  modifyOrganization,
  deleteOrganization,
  getOrganizationStats,
  getOrganizationWithMemberCount,
} from "../../src/models/organization.models";
import {
  testUsers,
  testOrganizations,
  testOrganizationMembers,
} from "../../src/database/test-data";
import {
  getUserUuid,
  getOrganizationUuid,
} from "../../src/database/test-data/testUuids";

describe("Organization Model CRUD Operations", () => {
  beforeAll(async () => {
    await seed({
      usersData: testUsers,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
    });
  });

  afterAll(() => {
    db.end();
  });

  describe("createOrganization", () => {
    it("should create a new organization with all fields", async () => {
      const newOrg = {
        name: "New Test Org",
        slug: "new-test-org",
        owner_id: getUserUuid(1),
      };

      const createdOrg = await createOrganization(newOrg);

      expect(createdOrg).toBeDefined();
      expect(createdOrg.id).toBeDefined();
      expect(createdOrg.name).toBe(newOrg.name);
      expect(createdOrg.slug).toBe(newOrg.slug);
      expect(createdOrg.owner_id).toBe(newOrg.owner_id);
      expect(createdOrg.created_at).toBeInstanceOf(Date);
    });

    it("should auto-generate slug from name if not provided", async () => {
      const newOrg = {
        name: "Auto Slug Organization!",
        owner_id: getUserUuid(1),
      };

      const createdOrg = await createOrganization(newOrg);

      expect(createdOrg.slug).toBe("auto-slug-organization");
    });

    it("should throw error for duplicate slug", async () => {
      await expect(
        createOrganization({
          name: "Another Acme",
          slug: "acme-corp",
          owner_id: getUserUuid(1),
        }),
      ).rejects.toMatchObject({
        status: 409,
        msg: "Organization slug already exists",
      });
    });

    it("should throw error when owner_id is missing", async () => {
      await expect(
        createOrganization({
          name: "No Owner Org",
          owner_id: "",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "owner_id and name are required",
      });
    });

    it("should throw error when name is missing", async () => {
      await expect(
        createOrganization({
          name: "",
          owner_id: getUserUuid(1),
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "owner_id and name are required",
      });
    });

    it("should throw error for invalid owner_id", async () => {
      await expect(
        createOrganization({
          name: "Invalid Owner Org",
          owner_id: "550e8400-e29b-41d4-a716-446655440999",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Invalid owner_id",
      });
    });
  });

  describe("getOrganizationById", () => {
    it("should find organization by ID", async () => {
      const org = await getOrganizationById(getOrganizationUuid(1));

      expect(org).toBeDefined();
      expect(org!.id).toBe(getOrganizationUuid(1));
      expect(org!.name).toBe("Acme Corporation");
      expect(org!.slug).toBe("acme-corp");
    });

    it("should return null for non-existent ID", async () => {
      const org = await getOrganizationById(
        "550e8400-e29b-41d4-a716-446655440999",
      );
      expect(org).toBeNull();
    });
  });

  describe("getOrganizationBySlug", () => {
    it("should find organization by slug", async () => {
      const org = await getOrganizationBySlug("acme-corp");

      expect(org).toBeDefined();
      expect(org!.name).toBe("Acme Corporation");
      expect(org!.slug).toBe("acme-corp");
    });

    it("should return null for non-existent slug", async () => {
      const org = await getOrganizationBySlug("non-existent-org");
      expect(org).toBeNull();
    });
  });

  describe("getOrganizations", () => {
    it("should return all organizations", async () => {
      const orgs = await getOrganizations();

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.length).toBeGreaterThanOrEqual(4);
    });

    it("should filter by owner_id", async () => {
      const orgs = await getOrganizations({ owner_id: getUserUuid(1) });

      expect(orgs.length).toBeGreaterThanOrEqual(2);
      orgs.forEach((org) => {
        expect(org.owner_id).toBe(getUserUuid(1));
      });
    });

    it("should filter by user membership", async () => {
      const orgs = await getOrganizations({ user_id: getUserUuid(2) });

      // Alice is member of ACME_CORP, ALICE_STARTUP, SHARED_PROJECT
      expect(orgs.length).toBeGreaterThanOrEqual(3);
    });

    it("should support pagination", async () => {
      const page1 = await getOrganizations({}, { limit: 2, offset: 0 });
      const page2 = await getOrganizations({}, { limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);

      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });
  });

  describe("getOrganizationsByUserId", () => {
    it("should return organizations with user role", async () => {
      const orgs = await getOrganizationsByUserId(getUserUuid(1));

      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.length).toBeGreaterThanOrEqual(2);

      orgs.forEach((org) => {
        expect(org.role).toBeDefined();
        expect(["owner", "admin", "member", "viewer"]).toContain(org.role);
      });
    });

    it("should return empty array for user with no memberships", async () => {
      // Create a new user with no memberships
      const { createUser } = await import("../../src/models/users.models");
      const newUser = await createUser({
        email: "nomemberships@example.com",
        password_hash: "test_hash",
      });

      const orgs = await getOrganizationsByUserId(newUser.user_id!);
      expect(orgs).toEqual([]);
    });

    it("should support pagination", async () => {
      const page1 = await getOrganizationsByUserId(getUserUuid(1), {
        limit: 1,
        offset: 0,
      });
      const page2 = await getOrganizationsByUserId(getUserUuid(1), {
        limit: 1,
        offset: 1,
      });

      expect(page1.length).toBeLessThanOrEqual(1);
      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });
  });

  describe("modifyOrganization", () => {
    it("should update organization name", async () => {
      const org = await createOrganization({
        name: "Original Name",
        owner_id: getUserUuid(1),
      });

      const updated = await modifyOrganization(org.id!, {
        name: "Updated Name",
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.updated_at).toBeInstanceOf(Date);
    });

    it("should update organization slug", async () => {
      const org = await createOrganization({
        name: "Slug Test Org",
        owner_id: getUserUuid(1),
      });

      const updated = await modifyOrganization(org.id!, { slug: "new-slug" });

      expect(updated.slug).toBe("new-slug");
    });

    it("should throw error for duplicate slug", async () => {
      const org = await createOrganization({
        name: "Unique Slug Org",
        slug: "unique-slug-org",
        owner_id: getUserUuid(1),
      });

      await expect(
        modifyOrganization(org.id!, { slug: "acme-corp" }),
      ).rejects.toMatchObject({
        status: 409,
        msg: "Organization slug already exists",
      });
    });

    it("should throw error for non-existent organization", async () => {
      await expect(
        modifyOrganization("550e8400-e29b-41d4-a716-446655440999", {
          name: "New Name",
        }),
      ).rejects.toMatchObject({
        status: 404,
        msg: "Organization not found",
      });
    });

    it("should throw error when no valid fields provided", async () => {
      await expect(
        modifyOrganization(getOrganizationUuid(1), {}),
      ).rejects.toMatchObject({
        status: 400,
        msg: "No valid fields to update",
      });
    });
  });

  describe("deleteOrganization", () => {
    it("should delete an organization", async () => {
      const org = await createOrganization({
        name: "To Delete Org",
        owner_id: getUserUuid(1),
      });

      const deleted = await deleteOrganization(org.id!);

      expect(deleted.id).toBe(org.id);

      const found = await getOrganizationById(org.id!);
      expect(found).toBeNull();
    });

    it("should throw error for non-existent organization", async () => {
      await expect(
        deleteOrganization("550e8400-e29b-41d4-a716-446655440999"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "Organization not found",
      });
    });

    it("soft-deletes: the row and its memberships persist", async () => {
      const org = await createOrganization({
        name: "Soft Delete Persistence Org",
        owner_id: getUserUuid(1),
      });
      await db.query(
        "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
        [org.id, getUserUuid(1)],
      );

      await deleteOrganization(org.id!);

      const row = await db.query("SELECT * FROM organizations WHERE id = $1", [
        org.id,
      ]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].deleted_at).not.toBeNull();

      const members = await db.query(
        "SELECT * FROM organization_members WHERE organization_id = $1",
        [org.id],
      );
      expect(members.rows).toHaveLength(1);
    });

    it("every lookup respects deleted_at", async () => {
      const org = await createOrganization({
        name: "Deleted Lookup Org",
        slug: "deleted-lookup-org",
        owner_id: getUserUuid(1),
      });
      await db.query(
        "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
        [org.id, getUserUuid(1)],
      );
      await deleteOrganization(org.id!);

      expect(await getOrganizationById(org.id!)).toBeNull();
      expect(await getOrganizationBySlug("deleted-lookup-org")).toBeNull();
      expect(await getOrganizationWithMemberCount(org.id!)).toBeNull();

      const listed = await getOrganizations();
      expect(listed.some((o) => o.id === org.id)).toBe(false);

      const byUser = await getOrganizationsByUserId(getUserUuid(1));
      expect(byUser.some((o) => o.id === org.id)).toBe(false);

      await expect(
        modifyOrganization(org.id!, { name: "Rename Attempt" }),
      ).rejects.toMatchObject({ status: 404 });

      // A second delete is a 404, not a silent no-op.
      await expect(deleteOrganization(org.id!)).rejects.toMatchObject({
        status: 404,
      });
    });

    it("frees the slug for reuse while a live duplicate still conflicts", async () => {
      const first = await createOrganization({
        name: "Slug Reuse Org",
        slug: "slug-reuse-org",
        owner_id: getUserUuid(1),
      });
      await deleteOrganization(first.id!);

      // The partial unique index only guards live rows.
      const second = await createOrganization({
        name: "Slug Reuse Org Again",
        slug: "slug-reuse-org",
        owner_id: getUserUuid(1),
      });
      expect(second.id).not.toBe(first.id);

      await expect(
        createOrganization({
          name: "Slug Reuse Org Third",
          slug: "slug-reuse-org",
          owner_id: getUserUuid(1),
        }),
      ).rejects.toMatchObject({
        status: 409,
        msg: "Organization slug already exists",
      });
    });

    it("excludes soft-deleted organizations from the stats", async () => {
      const before = await getOrganizationStats();

      const org = await createOrganization({
        name: "Stats Exclusion Org",
        owner_id: getUserUuid(1),
      });
      const during = await getOrganizationStats();
      expect(during.total).toBe(before.total + 1);

      await deleteOrganization(org.id!);
      const after = await getOrganizationStats();
      expect(after.total).toBe(before.total);
    });
  });

  describe("getOrganizationStats", () => {
    it("should return organization statistics", async () => {
      const stats = await getOrganizationStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("total_members");
      expect(stats).toHaveProperty("created_last_30_days");

      expect(typeof stats.total).toBe("number");
      expect(typeof stats.total_members).toBe("number");
      expect(typeof stats.created_last_30_days).toBe("number");

      expect(stats.total).toBeGreaterThanOrEqual(4);
      expect(stats.total_members).toBeGreaterThanOrEqual(8);
    });
  });

  describe("getOrganizationWithMemberCount", () => {
    it("should return organization with member count", async () => {
      const org = await getOrganizationWithMemberCount(getOrganizationUuid(1));

      expect(org).toBeDefined();
      expect(org!.name).toBe("Acme Corporation");
      expect(org!.member_count).toBeGreaterThanOrEqual(3);
    });

    it("should return null for non-existent organization", async () => {
      const org = await getOrganizationWithMemberCount(
        "550e8400-e29b-41d4-a716-446655440999",
      );
      expect(org).toBeNull();
    });
  });

  describe("Transaction handling", () => {
    it("should support transactions for createOrganization", async () => {
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const org = await createOrganization(
          {
            name: "Transaction Org",
            owner_id: getUserUuid(1),
          },
          client,
        );

        expect(org.name).toBe("Transaction Org");

        await client.query("ROLLBACK");

        const found = await getOrganizationById(org.id!);
        expect(found).toBeNull();
      } finally {
        client.release();
      }
    });

    it("should support transactions for modifyOrganization", async () => {
      const client = await db.connect();
      const org = await createOrganization({
        name: "Tx Modify Org",
        owner_id: getUserUuid(1),
      });

      try {
        await client.query("BEGIN");

        await modifyOrganization(org.id!, { name: "Modified in Tx" }, client);

        await client.query("ROLLBACK");

        const found = await getOrganizationById(org.id!);
        expect(found!.name).toBe("Tx Modify Org");
      } finally {
        client.release();
      }
    });
  });
});
