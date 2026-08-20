import bcrypt from "bcrypt";
import { PoolClient } from "pg";
import {
  createInvitationService,
  InvitationService,
  SessionStart,
} from "../../src/services";
import { Invitation } from "@auth-boilerplate/shared";
import { User } from "../../src/types";
import { httpError } from "../../src/utils/httpError";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const INVITER_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";
const INVITATION_ID = "44444444-4444-4444-4444-444444444444";

const baseInvitation: Invitation = {
  id: INVITATION_ID,
  email: "invitee@example.com",
  type: "org_invite",
  organization_id: ORG_ID,
  role: "member",
  invited_by: INVITER_ID,
  is_existing_user: false,
  expires_at: "2027-01-01T00:00:00.000Z",
};

describe("invitationService", () => {
  let invitationByToken: Map<string, Invitation>;
  let usersByEmail: Map<string, User>;
  let orgExists: boolean;
  let isMember: boolean;
  let createdUsers: { dto: Record<string, unknown>; client: unknown }[];
  let addedMembers: {
    organizationId: string;
    member: { user_id: string; role: string };
    addedBy: string | null;
    client: unknown;
  }[];
  let usedInvitationIds: string[];
  let invalidateCalls: { email: string; type: string; client: unknown }[];
  let createInvitationCalls: {
    dto: Record<string, unknown>;
    client: unknown;
  }[];
  let startSessionCalls: {
    principal: Record<string, unknown>;
    client: unknown;
  }[];
  let sentInvites: Record<string, unknown>[];
  let invitation: InvitationService;

  const txClient = { transaction: true } as unknown as PoolClient;

  beforeEach(() => {
    invitationByToken = new Map();
    usersByEmail = new Map();
    orgExists = true;
    isMember = false;
    createdUsers = [];
    addedMembers = [];
    usedInvitationIds = [];
    invalidateCalls = [];
    createInvitationCalls = [];
    startSessionCalls = [];
    sentInvites = [];

    invitation = createInvitationService({
      invitations: {
        createInvitation: async (dto, client) => {
          createInvitationCalls.push({ dto, client });
          return {
            invitation: { ...baseInvitation, email: dto.email },
            token: "raw-token",
          };
        },
        validateInvitationToken: async (token, _type, client) => {
          void client;
          const found = invitationByToken.get(token);
          if (!found) {
            throw httpError(404, "Invalid or expired invitation");
          }
          // The real validator owns the dead-org invariant (D2) — the fake
          // must model it or the service tests exercise a validator that
          // doesn't exist.
          if (found.organization_id && !orgExists) {
            throw httpError(404, "Invalid or expired invitation");
          }
          return found;
        },
        markInvitationUsed: async (id) => {
          usedInvitationIds.push(id);
          return { ...baseInvitation, used_at: "now" };
        },
        invalidatePendingInvitations: async (email, type, client) => {
          invalidateCalls.push({ email, type, client });
          return 0;
        },
      },
      users: {
        createUser: async (dto, client) => {
          createdUsers.push({ dto, client });
          return { user_id: USER_ID, email: dto.email! };
        },
        getUser: async (email) => usersByEmail.get(email) ?? null,
        getUserById: async () => ({
          user_id: INVITER_ID,
          email: "inviter@example.com",
        }),
        getUserWithPassword: async (email) => usersByEmail.get(email) ?? null,
      },
      organizations: {
        getOrganizationById: async () =>
          orgExists
            ? { id: ORG_ID, name: "Acme", slug: "acme", owner_id: INVITER_ID }
            : null,
      },
      members: {
        addOrganizationMember: async (
          organizationId,
          member,
          addedBy,
          client,
        ) => {
          const row = {
            id: "membership-id",
            organization_id: organizationId,
            user_id: member.user_id,
            role: member.role ?? ("member" as const),
            invited_by: addedBy ?? null,
          };
          addedMembers.push({
            organizationId,
            member: { user_id: row.user_id, role: row.role },
            addedBy: row.invited_by,
            client,
          });
          return row;
        },
        isUserMemberOfOrg: async () => isMember,
      },
      startSession: async (principal, client): Promise<SessionStart> => {
        startSessionCalls.push({ principal, client });
        return principal.mfa_enabled
          ? { kind: "mfa_required", challengeToken: "challenge" }
          : { kind: "session", accessToken: "access", refreshToken: "refresh" };
      },
      sendOrgInvite: async (params) => {
        sentInvites.push(params);
      },
      runTransaction: (fn) => fn(txClient),
    });
  });

  const seedExistingUser = async (
    overrides: Partial<User> = {},
  ): Promise<void> => {
    usersByEmail.set("invitee@example.com", {
      user_id: USER_ID,
      email: "invitee@example.com",
      password_hash: await bcrypt.hash("Password1", 4),
      is_active: true,
      mfa_enabled: false,
      ...overrides,
    });
  };

  describe("inviteMember", () => {
    const params = {
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "member" as const,
      invitedBy: INVITER_ID,
    };

    it("refuses when the organization does not exist", async () => {
      orgExists = false;
      await expect(invitation.inviteMember(params)).rejects.toMatchObject({
        status: 404,
        message: "Organization not found",
      });
      expect(createInvitationCalls).toEqual([]);
    });

    it("refuses when the address already belongs to a member", async () => {
      await seedExistingUser();
      isMember = true;
      await expect(invitation.inviteMember(params)).rejects.toMatchObject({
        status: 409,
        message: "User is already a member of this organization",
      });
      expect(invalidateCalls).toEqual([]);
      expect(createInvitationCalls).toEqual([]);
    });

    it("invalidates pending invitations and creates the new one in the same transaction", async () => {
      const created = await invitation.inviteMember(params);

      expect(created.email).toBe("invitee@example.com");
      expect(invalidateCalls).toEqual([
        { email: "invitee@example.com", type: "org_invite", client: txClient },
      ]);
      expect(createInvitationCalls[0].client).toBe(txClient);
      expect(createInvitationCalls[0].dto).toMatchObject({
        email: "invitee@example.com",
        type: "org_invite",
        organization_id: ORG_ID,
        role: "member",
        invited_by: INVITER_ID,
      });
    });

    it("emails the raw token with the organization and inviter names", async () => {
      await invitation.inviteMember(params);

      expect(sentInvites).toEqual([
        {
          to: "invitee@example.com",
          token: "raw-token",
          organizationName: "Acme",
          role: "member",
          inviterEmail: "inviter@example.com",
        },
      ]);
    });

    it("invites an existing non-member without complaint", async () => {
      await seedExistingUser();
      isMember = false;
      await expect(invitation.inviteMember(params)).resolves.toMatchObject({
        email: "invitee@example.com",
      });
    });
  });

  describe("acceptInvitation", () => {
    it("refuses an invitation with no organization attached", async () => {
      invitationByToken.set("token", {
        ...baseInvitation,
        organization_id: null,
      });
      await expect(
        invitation.acceptInvitation("token", "Password1"),
      ).rejects.toMatchObject({
        status: 400,
        message: "Invalid organization invitation",
      });
    });

    it("refuses an invitation whose organization was soft-deleted, writing nothing", async () => {
      invitationByToken.set("token", baseInvitation);
      orgExists = false;

      await expect(
        invitation.acceptInvitation("token", "Password1"),
      ).rejects.toMatchObject({
        status: 404,
        message: "Invalid or expired invitation",
      });
      expect(createdUsers).toEqual([]);
      expect(addedMembers).toEqual([]);
      expect(usedInvitationIds).toEqual([]);
      expect(startSessionCalls).toEqual([]);
    });

    describe("for an existing account", () => {
      beforeEach(() => {
        invitationByToken.set("token", {
          ...baseInvitation,
          is_existing_user: true,
        });
      });

      it("requires a password", async () => {
        await seedExistingUser();
        await expect(
          invitation.acceptInvitation("token", undefined),
        ).rejects.toMatchObject({
          status: 400,
          message: "Password is required to verify your identity",
        });
        expect(addedMembers).toEqual([]);
      });

      it("refuses when the account no longer exists", async () => {
        await expect(
          invitation.acceptInvitation("token", "Password1"),
        ).rejects.toMatchObject({ status: 404, message: "User not found" });
      });

      it("refuses a deactivated account before any write", async () => {
        await seedExistingUser({ is_active: false });
        await expect(
          invitation.acceptInvitation("token", "Password1"),
        ).rejects.toMatchObject({
          status: 403,
          message: "Account is deactivated",
        });
        expect(addedMembers).toEqual([]);
        expect(usedInvitationIds).toEqual([]);
      });

      it("refuses a wrong password", async () => {
        await seedExistingUser();
        await expect(
          invitation.acceptInvitation("token", "wrong"),
        ).rejects.toMatchObject({ status: 401, message: "Invalid password" });
        expect(addedMembers).toEqual([]);
      });

      it("joins the org, marks the invitation used and starts a session", async () => {
        await seedExistingUser();
        const outcome = await invitation.acceptInvitation("token", "Password1");

        expect(outcome.start.kind).toBe("session");
        expect(outcome.userId).toBe(USER_ID);
        expect(addedMembers).toEqual([
          {
            organizationId: ORG_ID,
            member: { user_id: USER_ID, role: "member" },
            addedBy: INVITER_ID,
            client: txClient,
          },
        ]);
        expect(usedInvitationIds).toEqual([INVITATION_ID]);
        expect(startSessionCalls[0]).toEqual({
          principal: {
            role_type: "user",
            role_id: USER_ID,
            is_active: true,
            mfa_enabled: false,
            email_verified: true,
          },
          client: txClient,
        });
        expect(createdUsers).toEqual([]);
      });

      // S2 decision (a): membership ≠ authentication. The org-join commits,
      // the session waits for the second factor.
      it("still commits the org-join for an MFA-enabled account, but returns a challenge", async () => {
        await seedExistingUser({ mfa_enabled: true });
        const outcome = await invitation.acceptInvitation("token", "Password1");

        expect(outcome.start).toEqual({
          kind: "mfa_required",
          challengeToken: "challenge",
        });
        expect(addedMembers).toHaveLength(1);
        expect(usedInvitationIds).toEqual([INVITATION_ID]);
      });
    });

    describe("for a new account", () => {
      beforeEach(() => {
        invitationByToken.set("token", baseInvitation);
      });

      it("requires a password", async () => {
        await expect(
          invitation.acceptInvitation("token", undefined),
        ).rejects.toMatchObject({
          status: 400,
          message: "Password is required to create your account",
        });
        expect(createdUsers).toEqual([]);
      });

      it("creates a verified, active, org-invited account with a hashed password", async () => {
        const outcome = await invitation.acceptInvitation("token", "Password1");

        expect(outcome.start.kind).toBe("session");
        expect(createdUsers).toHaveLength(1);
        expect(createdUsers[0].client).toBe(txClient);
        expect(createdUsers[0].dto).toMatchObject({
          email: "invitee@example.com",
          email_verified: true,
          is_active: true,
          created_through: "org_invited",
        });
        const storedHash = createdUsers[0].dto.password_hash as string;
        await expect(bcrypt.compare("Password1", storedHash)).resolves.toBe(
          true,
        );
        expect(addedMembers[0].member.user_id).toBe(USER_ID);
      });
    });
  });

  describe("mintInvitation", () => {
    it("supersedes pending admin invitations and mints the new one in the same transaction", async () => {
      const result = await invitation.mintInvitation({
        email: "new.admin@example.com",
        type: "admin_registration",
      });

      expect(invalidateCalls).toEqual([
        {
          email: "new.admin@example.com",
          type: "admin_registration",
          client: txClient,
        },
      ]);
      expect(createInvitationCalls).toEqual([
        {
          dto: { email: "new.admin@example.com", type: "admin_registration" },
          client: txClient,
        },
      ]);
      expect(result.token).toBe("raw-token");
      expect(result.invitation.email).toBe("new.admin@example.com");
    });
  });
});
