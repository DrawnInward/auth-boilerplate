import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  addOrganizationMember,
  getOrganizationMember,
  getOrganizationMemberById,
  getOrganizationMembers,
  getUserMemberships,
  updateMemberRole,
  removeOrganizationMember,
  transferOwnership,
  getMemberCount,
  isUserMemberOfOrg,
  getUserRoleInOrg,
} from "../../src/models/organizationMembers.models";
import { createOrganization } from "../../src/models/organization.models";
import {
  testUsers,
  testOrganizations,
  testOrganizationMembers,
} from "../../src/database/test-data";
import {
  getUserUuid,
  getOrganizationUuid,
  getOrgMemberUuid,
} from "../../src/database/test-data/testUuids";

describe("Organization Members Model CRUD Operations", () => {
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

  describe("addOrganizationMember", () => {
    it("should add a new member to an organization", async () => {
      // Create a new org for this test
      const org = await createOrganization({
        name: "Member Test Org",
        owner_id: getUserUuid(1),
      });

      const member = await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
        role: "member",
      });

      expect(member).toBeDefined();
      expect(member.id).toBeDefined();
      expect(member.organization_id).toBe(org.id);
      expect(member.user_id).toBe(getUserUuid(2));
      expect(member.role).toBe("member");
      expect(member.joined_at).toBeInstanceOf(Date);
    });

    it("should add member with invited_by", async () => {
      const org = await createOrganization({
        name: "Invited By Test Org",
        owner_id: getUserUuid(1),
      });

      const member = await addOrganizationMember(
        org.id!,
        { user_id: getUserUuid(3), role: "viewer" },
        getUserUuid(1),
      );

      expect(member.invited_by).toBe(getUserUuid(1));
    });

    it("should default to member role if not specified", async () => {
      const org = await createOrganization({
        name: "Default Role Org",
        owner_id: getUserUuid(1),
      });

      const member = await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
      });

      expect(member.role).toBe("member");
    });

    it("should throw error for duplicate membership", async () => {
      await expect(
        addOrganizationMember(getOrganizationUuid(1), {
          user_id: getUserUuid(2), // Alice is already a member
          role: "member",
        }),
      ).rejects.toMatchObject({
        status: 409,
        msg: "User is already a member of this organization",
      });
    });

    it("should throw error when user_id is missing", async () => {
      await expect(
        addOrganizationMember(getOrganizationUuid(1), {
          user_id: "",
          role: "member",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "user_id is required",
      });
    });

    it("should throw error for invalid user_id", async () => {
      await expect(
        addOrganizationMember(getOrganizationUuid(1), {
          user_id: "550e8400-e29b-41d4-a716-446655440999",
          role: "member",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Invalid organization_id or user_id",
      });
    });
  });

  describe("getOrganizationMember", () => {
    it("should find member by org and user ID", async () => {
      const member = await getOrganizationMember(
        getOrganizationUuid(1),
        getUserUuid(1),
      );

      expect(member).toBeDefined();
      expect(member!.organization_id).toBe(getOrganizationUuid(1));
      expect(member!.user_id).toBe(getUserUuid(1));
      expect(member!.role).toBe("owner");
    });

    it("should return null for non-member", async () => {
      // Bob is not a member of Alice's startup
      const member = await getOrganizationMember(
        getOrganizationUuid(3),
        getUserUuid(3),
      );
      expect(member).toBeNull();
    });
  });

  describe("getOrganizationMemberById", () => {
    it("should find member by ID", async () => {
      const member = await getOrganizationMemberById(getOrgMemberUuid(1));

      expect(member).toBeDefined();
      expect(member!.id).toBe(getOrgMemberUuid(1));
    });

    it("should return null for non-existent ID", async () => {
      const member = await getOrganizationMemberById(
        "550e8400-e29b-41d4-a716-446655440999",
      );
      expect(member).toBeNull();
    });
  });

  describe("getOrganizationMembers", () => {
    it("should return all members with user email", async () => {
      const members = await getOrganizationMembers(getOrganizationUuid(1));

      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeGreaterThanOrEqual(3);

      members.forEach((member) => {
        expect(member.email).toBeDefined();
        expect(member.organization_id).toBe(getOrganizationUuid(1));
      });
    });

    it("should support pagination", async () => {
      const page1 = await getOrganizationMembers(getOrganizationUuid(1), {
        limit: 2,
        offset: 0,
      });
      const page2 = await getOrganizationMembers(getOrganizationUuid(1), {
        limit: 2,
        offset: 2,
      });

      expect(page1.length).toBeLessThanOrEqual(2);
      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });

    it("should return empty array for org with no members", async () => {
      const org = await createOrganization({
        name: "Empty Org",
        owner_id: getUserUuid(1),
      });

      const members = await getOrganizationMembers(org.id!);
      expect(members).toEqual([]);
    });
  });

  describe("getUserMemberships", () => {
    it("should return all memberships for a user", async () => {
      const memberships = await getUserMemberships(getUserUuid(1));

      expect(Array.isArray(memberships)).toBe(true);
      expect(memberships.length).toBeGreaterThanOrEqual(2);

      memberships.forEach((membership) => {
        expect(membership.user_id).toBe(getUserUuid(1));
      });
    });

    it("should support pagination", async () => {
      const page1 = await getUserMemberships(getUserUuid(1), {
        limit: 1,
        offset: 0,
      });
      const page2 = await getUserMemberships(getUserUuid(1), {
        limit: 1,
        offset: 1,
      });

      expect(page1.length).toBeLessThanOrEqual(1);
      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });
  });

  describe("updateMemberRole", () => {
    it("should update member role", async () => {
      const org = await createOrganization({
        name: "Role Update Org",
        owner_id: getUserUuid(1),
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
        role: "member",
      });

      const updated = await updateMemberRole(org.id!, getUserUuid(2), "admin");

      expect(updated.role).toBe("admin");
    });

    it("should not allow setting role to owner directly", async () => {
      const org = await createOrganization({
        name: "No Direct Owner Org",
        owner_id: getUserUuid(1),
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
        role: "member",
      });

      await expect(
        updateMemberRole(org.id!, getUserUuid(2), "owner"),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Cannot set role to owner directly. Use transfer ownership.",
      });
    });

    it("should not allow changing owner role", async () => {
      await expect(
        updateMemberRole(getOrganizationUuid(1), getUserUuid(1), "admin"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "Member not found or cannot modify owner role",
      });
    });

    it("should throw error for non-member", async () => {
      await expect(
        updateMemberRole(getOrganizationUuid(3), getUserUuid(3), "admin"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "Member not found or cannot modify owner role",
      });
    });
  });

  describe("removeOrganizationMember", () => {
    it("should remove a member from organization", async () => {
      const org = await createOrganization({
        name: "Remove Member Org",
        owner_id: getUserUuid(1),
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
        role: "member",
      });

      const removed = await removeOrganizationMember(org.id!, getUserUuid(2));

      expect(removed.user_id).toBe(getUserUuid(2));

      const member = await getOrganizationMember(org.id!, getUserUuid(2));
      expect(member).toBeNull();
    });

    it("should not allow removing the owner", async () => {
      await expect(
        removeOrganizationMember(getOrganizationUuid(1), getUserUuid(1)),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Cannot remove owner from organization. Transfer ownership first.",
      });
    });

    it("should throw error for non-member", async () => {
      await expect(
        removeOrganizationMember(getOrganizationUuid(3), getUserUuid(3)),
      ).rejects.toMatchObject({
        status: 404,
        msg: "Member not found",
      });
    });
  });

  describe("transferOwnership", () => {
    it("should transfer ownership to another member", async () => {
      const org = await createOrganization({
        name: "Transfer Ownership Org",
        owner_id: getUserUuid(1),
      });

      // Add owner as member
      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(1),
        role: "owner",
      });

      // Add new member who will become owner
      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
        role: "admin",
      });

      const { oldOwner, newOwner } = await transferOwnership(
        org.id!,
        getUserUuid(1),
        getUserUuid(2),
      );

      expect(oldOwner.role).toBe("admin");
      expect(newOwner.role).toBe("owner");
    });

    it("should throw error if new owner is not a member", async () => {
      const org = await createOrganization({
        name: "Invalid Transfer Org",
        owner_id: getUserUuid(1),
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(1),
        role: "owner",
      });

      await expect(
        transferOwnership(org.id!, getUserUuid(1), getUserUuid(3)),
      ).rejects.toMatchObject({
        status: 400,
        msg: "New owner must be an existing member of the organization",
      });
    });

    it("should throw error if current user is not owner", async () => {
      const org = await createOrganization({
        name: "Non Owner Transfer Org",
        owner_id: getUserUuid(1),
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(1),
        role: "owner",
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
        role: "admin",
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(3),
        role: "member",
      });

      await expect(
        transferOwnership(org.id!, getUserUuid(2), getUserUuid(3)),
      ).rejects.toMatchObject({
        status: 403,
        msg: "Only current owner can transfer ownership",
      });
    });
  });

  describe("getMemberCount", () => {
    it("should return correct member count", async () => {
      const count = await getMemberCount(getOrganizationUuid(1));
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it("should return 0 for org with no members", async () => {
      const org = await createOrganization({
        name: "No Members Org",
        owner_id: getUserUuid(1),
      });

      const count = await getMemberCount(org.id!);
      expect(count).toBe(0);
    });
  });

  describe("isUserMemberOfOrg", () => {
    it("should return true for member", async () => {
      const isMember = await isUserMemberOfOrg(
        getOrganizationUuid(1),
        getUserUuid(1),
      );
      expect(isMember).toBe(true);
    });

    it("should return false for non-member", async () => {
      const isMember = await isUserMemberOfOrg(
        getOrganizationUuid(3),
        getUserUuid(3),
      );
      expect(isMember).toBe(false);
    });
  });

  describe("getUserRoleInOrg", () => {
    it("should return role for member", async () => {
      const role = await getUserRoleInOrg(
        getOrganizationUuid(1),
        getUserUuid(1),
      );
      expect(role).toBe("owner");
    });

    it("should return null for non-member", async () => {
      const role = await getUserRoleInOrg(
        getOrganizationUuid(3),
        getUserUuid(3),
      );
      expect(role).toBeNull();
    });
  });

  describe("Transaction handling", () => {
    it("should support transactions for addOrganizationMember", async () => {
      const client = await db.connect();
      const org = await createOrganization({
        name: "Tx Member Org",
        owner_id: getUserUuid(1),
      });

      try {
        await client.query("BEGIN");

        const member = await addOrganizationMember(
          org.id!,
          { user_id: getUserUuid(2), role: "member" },
          null,
          client,
        );

        expect(member.user_id).toBe(getUserUuid(2));

        await client.query("ROLLBACK");

        const found = await getOrganizationMember(org.id!, getUserUuid(2));
        expect(found).toBeNull();
      } finally {
        client.release();
      }
    });

    it("should support transactions for updateMemberRole", async () => {
      const client = await db.connect();
      const org = await createOrganization({
        name: "Tx Role Org",
        owner_id: getUserUuid(1),
      });

      await addOrganizationMember(org.id!, {
        user_id: getUserUuid(2),
        role: "member",
      });

      try {
        await client.query("BEGIN");

        await updateMemberRole(org.id!, getUserUuid(2), "admin", client);

        await client.query("ROLLBACK");

        const member = await getOrganizationMember(org.id!, getUserUuid(2));
        expect(member!.role).toBe("member");
      } finally {
        client.release();
      }
    });
  });
});
