import seed from "../../src/database/seed";
import db from "../../src/database/db";
import {
  createInvitation,
  getInvitationById,
  getInvitationByTokenHash,
  markInvitationUsed,
  invalidatePendingInvitations,
  listInvitationsByOrganization,
  deleteInvitation,
  cleanupExpiredInvitations,
  validateInvitationToken,
  getPendingInvitationsForEmail,
} from "../../src/models/invitations.models";
import {
  testUsers,
  testOrganizations,
  testOrganizationMembers,
  testInvitations,
  TEST_TOKENS,
} from "../../src/database/test-data";
import {
  getUserUuid,
  getOrganizationUuid,
  getInvitationUuid,
} from "../../src/database/test-data/testUuids";
import { determinateHash } from "../../src/utils";

describe("Invitation Model CRUD Operations", () => {
  beforeAll(async () => {
    await seed({
      usersData: testUsers,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
      invitationsData: testInvitations,
    });
  });

  afterAll(() => {
    db.end();
  });

  describe("createInvitation", () => {
    it("should create a registration invitation", async () => {
      const { invitation, token } = await createInvitation({
        email: "newreg@example.com",
        type: "registration",
      });

      expect(invitation).toBeDefined();
      expect(invitation.id).toBeDefined();
      expect(invitation.email).toBe("newreg@example.com");
      expect(invitation.type).toBe("registration");
      expect(invitation.token_hash).toBeDefined();
      expect(invitation.is_existing_user).toBe(false);
      expect(invitation.expires_at).toBeDefined();
      expect(invitation.used_at).toBeNull();
      expect(invitation.organization_id).toBeNull();
      expect(invitation.role).toBeNull();

      // Token should be returned (unhashed)
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);

      // Token hash should match
      const expectedHash = determinateHash(token);
      expect(invitation.token_hash).toBe(expectedHash);
    });

    it("should create an org_invite invitation with required fields", async () => {
      const { invitation, token } = await createInvitation({
        email: "neworginvite@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(1),
        role: "member",
        invited_by: getUserUuid(1),
      });

      expect(invitation).toBeDefined();
      expect(invitation.type).toBe("org_invite");
      expect(invitation.organization_id).toBe(getOrganizationUuid(1));
      expect(invitation.role).toBe("member");
      expect(invitation.invited_by).toBe(getUserUuid(1));
      expect(token).toBeDefined();
    });

    it("should create a password_reset invitation", async () => {
      const { invitation, token } = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      expect(invitation).toBeDefined();
      expect(invitation.type).toBe("password_reset");
      expect(invitation.is_existing_user).toBe(true); // User exists
      expect(token).toBeDefined();
    });

    it("should create an email_change invitation with required fields", async () => {
      const { invitation, token } = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "newemail@example.com",
        user_id: getUserUuid(1),
      });

      expect(invitation).toBeDefined();
      expect(invitation.type).toBe("email_change");
      expect(invitation.email).toBe("test@example.com");
      expect(invitation.new_email).toBe("newemail@example.com");
      expect(invitation.user_id).toBe(getUserUuid(1));
      expect(invitation.is_existing_user).toBe(true);
      expect(token).toBeDefined();
    });

    it("should throw error for email_change without new_email", async () => {
      await expect(
        createInvitation({
          email: "test@example.com",
          type: "email_change",
          user_id: getUserUuid(1),
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Email change requires new_email and user_id",
      });
    });

    it("should throw error for email_change without user_id", async () => {
      await expect(
        createInvitation({
          email: "test@example.com",
          type: "email_change",
          new_email: "newemail@example.com",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Email change requires new_email and user_id",
      });
    });

    it("should lowercase new_email for email_change", async () => {
      const { invitation } = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "UPPERCASE@EXAMPLE.COM",
        user_id: getUserUuid(1),
      });

      expect(invitation.new_email).toBe("uppercase@example.com");
    });

    it("should detect existing user when creating invitation", async () => {
      const { invitation } = await createInvitation({
        email: "test@example.com", // Existing user
        type: "registration",
      });

      expect(invitation.is_existing_user).toBe(true);
    });

    it("should detect non-existing user when creating invitation", async () => {
      const { invitation } = await createInvitation({
        email: "brandnew@example.com", // Non-existing user
        type: "registration",
      });

      expect(invitation.is_existing_user).toBe(false);
    });

    it("should throw error for org_invite without organization_id", async () => {
      await expect(
        createInvitation({
          email: "test@example.com",
          type: "org_invite",
          role: "member",
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Organization invite requires organization_id and role",
      });
    });

    it("should throw error for org_invite without role", async () => {
      await expect(
        createInvitation({
          email: "test@example.com",
          type: "org_invite",
          organization_id: getOrganizationUuid(1),
        }),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Organization invite requires organization_id and role",
      });
    });

    it("should lowercase email addresses", async () => {
      const { invitation } = await createInvitation({
        email: "UPPERCASE@EXAMPLE.COM",
        type: "registration",
      });

      expect(invitation.email).toBe("uppercase@example.com");
    });
  });

  describe("getInvitationById", () => {
    it("should find invitation by ID", async () => {
      const invitation = await getInvitationById(
        getInvitationUuid(1), // VALID_REGISTRATION
      );

      expect(invitation).toBeDefined();
      expect(invitation!.id).toBe(getInvitationUuid(1));
      expect(invitation!.email).toBe("newuser@example.com");
      expect(invitation!.type).toBe("registration");
    });

    it("should return null for non-existent ID", async () => {
      const invitation = await getInvitationById(
        "550e8400-e29b-41d4-a716-446655440999",
      );
      expect(invitation).toBeNull();
    });
  });

  describe("getInvitationByTokenHash", () => {
    it("should find invitation by token hash", async () => {
      const tokenHash = determinateHash(TEST_TOKENS.VALID_REGISTRATION);
      const invitation = await getInvitationByTokenHash(tokenHash);

      expect(invitation).toBeDefined();
      expect(invitation!.email).toBe("newuser@example.com");
      expect(invitation!.type).toBe("registration");
    });

    it("should return null for non-existent token hash", async () => {
      const tokenHash = determinateHash("non-existent-token");
      const invitation = await getInvitationByTokenHash(tokenHash);
      expect(invitation).toBeNull();
    });
  });

  describe("markInvitationUsed", () => {
    it("should mark invitation as used", async () => {
      // Create a new invitation to mark as used
      const { invitation } = await createInvitation({
        email: "markused@example.com",
        type: "registration",
      });

      const usedInvitation = await markInvitationUsed(invitation.id!);

      expect(usedInvitation.used_at).not.toBeNull();
      expect(usedInvitation.used_at).toBeInstanceOf(Date);
    });

    it("should throw error for non-existent invitation", async () => {
      await expect(
        markInvitationUsed("550e8400-e29b-41d4-a716-446655440999"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "Invitation not found",
      });
    });

    it("refuses to mark an already-used invitation (single-use CAS)", async () => {
      const { invitation } = await createInvitation({
        email: "markusedtwice@example.com",
        type: "registration",
      });

      await markInvitationUsed(invitation.id!);

      await expect(markInvitationUsed(invitation.id!)).rejects.toMatchObject({
        status: 400,
        msg: "Invitation has already been used",
      });
    });
  });

  describe("invalidatePendingInvitations", () => {
    it("should invalidate pending invitations for email and type", async () => {
      // Create multiple invitations for same email
      await createInvitation({
        email: "invalidate@example.com",
        type: "registration",
      });
      await createInvitation({
        email: "invalidate@example.com",
        type: "registration",
      });

      const count = await invalidatePendingInvitations(
        "invalidate@example.com",
        "registration",
      );

      expect(count).toBeGreaterThanOrEqual(2);

      // Verify they're invalidated
      const pending = await getPendingInvitationsForEmail(
        "invalidate@example.com",
        "registration",
      );
      expect(pending.length).toBe(0);
    });

    it("should not affect different types", async () => {
      await createInvitation({
        email: "mixedtypes@example.com",
        type: "registration",
      });
      await createInvitation({
        email: "test@example.com", // Existing user for password reset
        type: "password_reset",
      });

      await invalidatePendingInvitations("test@example.com", "registration");

      // Password reset should still be pending
      const pending = await getPendingInvitationsForEmail(
        "test@example.com",
        "password_reset",
      );
      expect(pending.length).toBeGreaterThanOrEqual(1);
    });

    it("should invalidate pending email_change invitations", async () => {
      await createInvitation({
        email: "invalidatechange@example.com",
        type: "email_change",
        new_email: "new1@example.com",
        user_id: getUserUuid(1),
      });
      await createInvitation({
        email: "invalidatechange@example.com",
        type: "email_change",
        new_email: "new2@example.com",
        user_id: getUserUuid(1),
      });

      const count = await invalidatePendingInvitations(
        "invalidatechange@example.com",
        "email_change",
      );

      expect(count).toBeGreaterThanOrEqual(2);

      const pending = await getPendingInvitationsForEmail(
        "invalidatechange@example.com",
        "email_change",
      );
      expect(pending.length).toBe(0);
    });
  });

  describe("listInvitationsByOrganization", () => {
    it("should list pending invitations for organization", async () => {
      const invitations = await listInvitationsByOrganization(
        getOrganizationUuid(1), // ACME_CORP
      );

      expect(Array.isArray(invitations)).toBe(true);
      // Should include VALID_ORG_INVITE but not EXPIRED or USED
      const validInvite = invitations.find(
        (i) => i.id === getInvitationUuid(4),
      );
      expect(validInvite).toBeDefined();

      // Should NOT include expired or used
      const expiredInvite = invitations.find(
        (i) => i.id === getInvitationUuid(5),
      );
      const usedInvite = invitations.find((i) => i.id === getInvitationUuid(6));
      expect(expiredInvite).toBeUndefined();
      expect(usedInvite).toBeUndefined();
    });

    it("should support pagination", async () => {
      const page1 = await listInvitationsByOrganization(
        getOrganizationUuid(1),
        { limit: 1, offset: 0 },
      );
      const page2 = await listInvitationsByOrganization(
        getOrganizationUuid(1),
        { limit: 1, offset: 1 },
      );

      expect(page1.length).toBeLessThanOrEqual(1);
      // If there's a second page, it should be different
      if (page2.length > 0 && page1.length > 0) {
        expect(page2[0].id).not.toBe(page1[0].id);
      }
    });

    it("should return empty array for organization with no pending invitations", async () => {
      const invitations = await listInvitationsByOrganization(
        getOrganizationUuid(3), // ALICE_STARTUP - no invitations
      );

      expect(invitations).toEqual([]);
    });
  });

  describe("deleteInvitation", () => {
    it("should delete an invitation", async () => {
      const { invitation } = await createInvitation({
        email: "todelete@example.com",
        type: "registration",
      });

      const deleted = await deleteInvitation(invitation.id!);
      expect(deleted).toBe(true);

      const found = await getInvitationById(invitation.id!);
      expect(found).toBeNull();
    });

    it("should return false for non-existent invitation", async () => {
      const deleted = await deleteInvitation(
        "550e8400-e29b-41d4-a716-446655440999",
      );
      expect(deleted).toBe(false);
    });
  });

  describe("cleanupExpiredInvitations", () => {
    it("should delete expired invitations", async () => {
      // The test data includes expired invitations
      const countBefore = await cleanupExpiredInvitations();
      expect(countBefore).toBeGreaterThanOrEqual(0);

      // Expired invitations should be gone
      const expiredReg = await getInvitationById(getInvitationUuid(2)); // EXPIRED_REGISTRATION
      const expiredOrg = await getInvitationById(getInvitationUuid(5)); // EXPIRED_ORG_INVITE
      const expiredPw = await getInvitationById(getInvitationUuid(8)); // EXPIRED_PASSWORD_RESET

      expect(expiredReg).toBeNull();
      expect(expiredOrg).toBeNull();
      expect(expiredPw).toBeNull();
    });
  });

  describe("validateInvitationToken", () => {
    it("should validate a valid token", async () => {
      const { token } = await createInvitation({
        email: "validate@example.com",
        type: "registration",
      });

      const invitation = await validateInvitationToken(token);

      expect(invitation).toBeDefined();
      expect(invitation.email).toBe("validate@example.com");
    });

    it("should validate token with expected type", async () => {
      const { token } = await createInvitation({
        email: "validatetype@example.com",
        type: "registration",
      });

      const invitation = await validateInvitationToken(token, "registration");
      expect(invitation).toBeDefined();
    });

    it("should throw error for wrong type", async () => {
      const { token } = await createInvitation({
        email: "wrongtype@example.com",
        type: "registration",
      });

      await expect(
        validateInvitationToken(token, "password_reset"),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Invalid invitation type",
      });
    });

    it("should throw error for used token", async () => {
      await expect(
        validateInvitationToken(TEST_TOKENS.USED_REGISTRATION),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Invitation has already been used",
      });
    });

    it("should throw error for invalid token", async () => {
      await expect(
        validateInvitationToken("invalid-token-that-does-not-exist"),
      ).rejects.toMatchObject({
        status: 404,
        msg: "Invalid or expired invitation",
      });
    });

    it("should validate email_change token with correct type", async () => {
      const { token } = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "validatechange@example.com",
        user_id: getUserUuid(1),
      });

      const invitation = await validateInvitationToken(token, "email_change");
      expect(invitation).toBeDefined();
      expect(invitation.type).toBe("email_change");
      expect(invitation.new_email).toBe("validatechange@example.com");
    });

    it("should reject email_change token when expecting password_reset", async () => {
      const { token } = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "wrongtypechange@example.com",
        user_id: getUserUuid(1),
      });

      await expect(
        validateInvitationToken(token, "password_reset"),
      ).rejects.toMatchObject({
        status: 400,
        msg: "Invalid invitation type",
      });
    });
  });

  describe("getPendingInvitationsForEmail", () => {
    it("should get pending invitations for email", async () => {
      await createInvitation({
        email: "pending@example.com",
        type: "registration",
      });

      const invitations = await getPendingInvitationsForEmail(
        "pending@example.com",
      );

      expect(invitations.length).toBeGreaterThanOrEqual(1);
      expect(invitations[0].email).toBe("pending@example.com");
      expect(invitations[0].used_at).toBeNull();
    });

    it("should filter by type when specified", async () => {
      await createInvitation({
        email: "filtertype@example.com",
        type: "registration",
      });

      const regInvitations = await getPendingInvitationsForEmail(
        "filtertype@example.com",
        "registration",
      );
      const pwInvitations = await getPendingInvitationsForEmail(
        "filtertype@example.com",
        "password_reset",
      );

      expect(regInvitations.length).toBeGreaterThanOrEqual(1);
      expect(pwInvitations.length).toBe(0);
    });

    it("should not include used invitations", async () => {
      const { invitation } = await createInvitation({
        email: "usedpending@example.com",
        type: "registration",
      });

      await markInvitationUsed(invitation.id!);

      const pending = await getPendingInvitationsForEmail(
        "usedpending@example.com",
      );
      const found = pending.find((i) => i.id === invitation.id);
      expect(found).toBeUndefined();
    });
  });

  describe("Transaction handling", () => {
    it("should support transactions for createInvitation", async () => {
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const { invitation } = await createInvitation(
          {
            email: "transaction@example.com",
            type: "registration",
          },
          client,
        );

        expect(invitation.email).toBe("transaction@example.com");

        await client.query("ROLLBACK");

        // Invitation should not exist after rollback
        const found = await getInvitationById(invitation.id!);
        expect(found).toBeNull();
      } finally {
        client.release();
      }
    });

    it("should support transactions for markInvitationUsed", async () => {
      const { invitation } = await createInvitation({
        email: "txtmark@example.com",
        type: "registration",
      });

      const client = await db.connect();

      try {
        await client.query("BEGIN");

        await markInvitationUsed(invitation.id!, client);

        await client.query("ROLLBACK");

        // Invitation should not be marked as used after rollback
        const found = await getInvitationById(invitation.id!);
        expect(found!.used_at).toBeNull();
      } finally {
        client.release();
      }
    });
  });
});
