import bcrypt from "bcrypt";
import { PoolClient } from "pg";
import type * as invitationModels from "../models/invitations.models";
import type * as userModels from "../models/users.models";
import type * as organizationModels from "../models/organization.models";
import type * as memberModels from "../models/organizationMembers.models";
import { Invitation, OrgInviteRole } from "@auth-boilerplate/shared";
import { hashPassword } from "../utils";
import { httpError } from "../utils/httpError";
import { AuthService, SessionStart } from "./auth.service";
import { EmailService } from "./email.service";

export type InvitationServiceDeps = {
  invitations: Pick<
    typeof invitationModels,
    | "createInvitation"
    | "validateInvitationToken"
    | "markInvitationUsed"
    | "invalidatePendingInvitations"
  >;
  users: Pick<
    typeof userModels,
    "createUser" | "getUser" | "getUserById" | "getUserWithPassword"
  >;
  organizations: Pick<typeof organizationModels, "getOrganizationById">;
  members: Pick<
    typeof memberModels,
    "addOrganizationMember" | "isUserMemberOfOrg"
  >;
  startSession: AuthService["startSession"];
  sendOrgInvite: EmailService["sendOrgInvite"];
  runTransaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
};

export type InviteMemberParams = {
  organizationId: string;
  email: string;
  role: OrgInviteRole;
  invitedBy: string;
};

export type AcceptedInvitation = {
  start: SessionStart;
  invitation: Invitation;
  userId: string;
};

export type InvitationService = {
  inviteMember(params: InviteMemberParams): Promise<Invitation>;
  acceptInvitation(
    token: string,
    password: string | undefined,
  ): Promise<AcceptedInvitation>;
};

export const createInvitationService = ({
  invitations,
  users,
  organizations,
  members,
  startSession,
  sendOrgInvite,
  runTransaction,
}: InvitationServiceDeps): InvitationService => {
  const inviteMember = async ({
    organizationId,
    email,
    role,
    invitedBy,
  }: InviteMemberParams): Promise<Invitation> => {
    const organization =
      await organizations.getOrganizationById(organizationId);
    if (!organization) {
      throw httpError(404, "Organization not found");
    }

    const existingUser = await users.getUser(email);
    if (existingUser) {
      const isMember = await members.isUserMemberOfOrg(
        organizationId,
        existingUser.user_id!,
      );
      if (isMember) {
        throw httpError(409, "User is already a member of this organization");
      }
    }

    // Atomic pair: a failed create must not leave the address with its
    // previous invitations already invalidated and nothing to accept.
    const { invitation, token } = await runTransaction(async (client) => {
      await invitations.invalidatePendingInvitations(
        email,
        "org_invite",
        client,
      );
      return invitations.createInvitation(
        {
          email,
          type: "org_invite",
          organization_id: organizationId,
          role,
          invited_by: invitedBy,
        },
        client,
      );
    });

    const inviter = await users.getUserById(invitedBy);

    await sendOrgInvite({
      to: email,
      token,
      organizationName: organization.name,
      role,
      inviterEmail: inviter?.email,
    });

    return invitation;
  };

  const acceptInvitation = async (
    token: string,
    password: string | undefined,
  ): Promise<AcceptedInvitation> =>
    runTransaction(async (client) => {
      const invitation = await invitations.validateInvitationToken(
        token,
        "org_invite",
        client,
      );

      if (!invitation.organization_id || !invitation.role) {
        throw httpError(400, "Invalid organization invitation");
      }

      // Organizations soft-delete (D2): the invitation row outlives its
      // organization, so a token must not mint accounts or memberships into a
      // dead tenant. Reads exactly like a token that never existed.
      const organization = await organizations.getOrganizationById(
        invitation.organization_id,
      );
      if (!organization) {
        throw httpError(404, "Invalid or expired invitation");
      }

      let userId: string;
      // An existing account can carry MFA and a deactivated flag; a freshly
      // created one never does.
      let mfaRequired = false;

      if (invitation.is_existing_user) {
        if (!password) {
          throw httpError(400, "Password is required to verify your identity");
        }

        const user = await users.getUserWithPassword(invitation.email);
        if (!user) {
          throw httpError(404, "User not found");
        }

        // Mirror login exactly: a deactivated account cannot authenticate
        // through this path either.
        if (!user.is_active) {
          throw httpError(403, "Account is deactivated");
        }

        const passwordMatch = await bcrypt.compare(
          password,
          user.password_hash!,
        );
        if (!passwordMatch) {
          throw httpError(401, "Invalid password");
        }

        userId = user.user_id!;
        mfaRequired = !!user.mfa_enabled;
      } else {
        if (!password) {
          throw httpError(400, "Password is required to create your account");
        }

        const passwordHash = await hashPassword(password);
        const user = await users.createUser(
          {
            email: invitation.email,
            password_hash: passwordHash,
            email_verified: true,
            is_active: true,
            created_through: "org_invited",
          },
          client,
        );

        userId = user.user_id!;
      }

      await members.addOrganizationMember(
        invitation.organization_id,
        {
          user_id: userId,
          role: invitation.role as OrgInviteRole,
        },
        invitation.invited_by || null,
        client,
      );

      await invitations.markInvitationUsed(invitation.id!, client);

      // The user has proven password + invite-token possession, so the org-join
      // is committed — but an MFA-enabled account must clear its second factor
      // before it gets a session, exactly as login requires. Issuing auth
      // cookies here would let a known password skip MFA entirely; startSession
      // makes that branch unskippable. (S2)
      const start = await startSession(
        {
          role_type: "user",
          role_id: userId,
          // Both branches above establish an active account: the existing user
          // mirrored login's deactivation check, the new one was created active.
          is_active: true,
          mfa_enabled: mfaRequired,
          email_verified: true,
        },
        client,
      );

      return { start, invitation, userId };
    });

  return { inviteMember, acceptInvitation };
};
