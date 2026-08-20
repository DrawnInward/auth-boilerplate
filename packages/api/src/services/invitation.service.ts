import type * as invitationModels from "../models/invitations.models";
import { verifyPassword } from "../utils/hashPassword";
import type * as userModels from "../models/users.models";
import type * as organizationModels from "../models/organization.models";
import type * as memberModels from "../models/organizationMembers.models";
import { Invitation, OrgInviteRole } from "@auth-boilerplate/shared";
import { CreateInvitationDto } from "../types";
import { hashPassword, isAccountActive } from "../utils";
import { httpError } from "../utils/httpError";
import { RunTransaction } from "../utils/withTransaction";
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
  runTransaction: RunTransaction;
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
  /**
   * Supersede any pending invitation for this address and type, and mint a
   * new one — in one transaction, so a failed mint can never leave the
   * address with its old token dead and no replacement.
   */
  mintInvitation(
    dto: CreateInvitationDto,
  ): Promise<{ invitation: Invitation; token: string }>;
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
  // Supersede any pending invitation for the address and mint the new one in
  // one transaction, so exactly one token is ever live per (email, type).
  const mintInvitation = (dto: CreateInvitationDto) =>
    runTransaction(async (client) => {
      await invitations.invalidatePendingInvitations(
        dto.email,
        dto.type,
        client,
      );
      return invitations.createInvitation(dto, client);
    });

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
    const { invitation, token } = await mintInvitation({
      email,
      type: "org_invite",
      organization_id: organizationId,
      role,
      invited_by: invitedBy,
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
  ): Promise<AcceptedInvitation> => {
    // All bcrypt CPU runs before the locking transaction: a burst of accepts
    // (or wrong-password retries) must not pin a pool connection and the
    // invitation's FOR UPDATE row lock for the length of a hash. The
    // transaction re-validates the token under the lock, so this pre-read
    // adds no TOCTOU beyond what login already accepts. (The validator also
    // owns the dead-org D2 invariant, so a soft-deleted tenant is refused
    // here and again under the lock.)
    const preview = await invitations.validateInvitationToken(
      token,
      "org_invite",
    );

    if (!preview.organization_id || !preview.role) {
      throw httpError(400, "Invalid organization invitation");
    }

    // An existing account can carry MFA and a deactivated flag; a freshly
    // created one never does.
    let verifiedUserId: string | null = null;
    let mfaRequired = false;
    let newUserPasswordHash: string | null = null;

    if (preview.is_existing_user) {
      if (!password) {
        throw httpError(400, "Password is required to verify your identity");
      }

      const user = await users.getUserWithPassword(preview.email);
      if (!user) {
        throw httpError(404, "User not found");
      }

      // Mirror login exactly: a deactivated account cannot authenticate
      // through this path either.
      if (!isAccountActive(user)) {
        throw httpError(403, "Account is deactivated");
      }

      // An OAuth-only account has no password to verify — without this
      // guard bcrypt throws on the NULL hash and the request 500s.
      if (!user.password_hash) {
        throw httpError(401, "Invalid password");
      }

      const passwordMatch = await verifyPassword(password, user.password_hash);
      if (!passwordMatch) {
        throw httpError(401, "Invalid password");
      }

      verifiedUserId = user.user_id!;
      mfaRequired = !!user.mfa_enabled;
    } else {
      if (!password) {
        throw httpError(400, "Password is required to create your account");
      }

      newUserPasswordHash = await hashPassword(password);
    }

    return runTransaction(async (client) => {
      // Re-validated under FOR UPDATE: of two concurrent accepts the loser
      // blocks here, re-reads the committed used_at and fails validation.
      const invitation = await invitations.validateInvitationToken(
        token,
        "org_invite",
        client,
      );

      if (!invitation.organization_id || !invitation.role) {
        throw httpError(400, "Invalid organization invitation");
      }

      let userId: string;

      if (invitation.is_existing_user) {
        // is_existing_user is frozen at mint, so the pre-read took this
        // branch too and verified the password there.
        userId = verifiedUserId!;
      } else {
        const user = await users.createUser(
          {
            email: invitation.email,
            password_hash: newUserPasswordHash!,
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
  };

  return { inviteMember, mintInvitation, acceptInvitation };
};
