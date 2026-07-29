import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import db from "../../database/db";
import { RequestWithUser } from "../../types";
import {
  createInvitation,
  validateInvitationToken,
  markInvitationUsed,
  listInvitationsByOrganization,
  deleteInvitation,
  getInvitationById,
  invalidatePendingInvitations,
} from "../../models/invitations.models";
import { getOrganizationById } from "../../models/organization.models";
import {
  addOrganizationMember,
  isUserMemberOfOrg,
} from "../../models/organizationMembers.models";
import {
  createUser,
  getUser,
  getUserById,
  getUserWithPassword,
} from "../../models/users.models";
import { addRefresh } from "../../models/refresh.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { getValidatedQuery } from "../../middleware/validate";
import type {
  OrganizationInvitationParams,
  OrganizationParams,
  PaginationQuery,
  TokenParams,
} from "@auth-boilerplate/shared";
import { services } from "../../services";
import { setAuthCookies, hashPassword } from "../../utils";
import {
  createMfaChallengeToken,
  setMfaChallengeCookie,
} from "../../utils/mfaChallenge";
import { httpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

import "../../utils/loadEnv";

export const inviteMember = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { email, role } = req.body;
    const invitedBy = req.user!.role_id;

    const organization = await getOrganizationById(organizationId);
    if (!organization) {
      throw httpError(404, "Organization not found");
    }

    const existingUser = await getUser(email);
    if (existingUser) {
      const isMember = await isUserMemberOfOrg(
        organizationId,
        existingUser.user_id!,
      );
      if (isMember) {
        throw httpError(409, "User is already a member of this organization");
      }
    }

    await invalidatePendingInvitations(email, "org_invite");

    const { invitation, token } = await createInvitation({
      email,
      type: "org_invite",
      organization_id: organizationId,
      role,
      invited_by: invitedBy,
    });

    const inviter = await getUserById(req.user!.role_id);

    await services.email.sendOrgInvite({
      to: email,
      token,
      organizationName: organization.name,
      role,
      inviterEmail: inviter?.email,
    });

    return sendCreated(
      res,
      {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
      },
      "Invitation sent successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const listInvitations = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { limit, offset } = getValidatedQuery<PaginationQuery>(res);
    const pagination = { limit, offset };

    const invitations = await listInvitationsByOrganization(
      organizationId,
      pagination,
    );

    // Remove token_hash from response
    const sanitizedInvitations = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      invited_by: inv.invited_by,
      is_existing_user: inv.is_existing_user,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
    }));

    return sendSuccess(
      res,
      sanitizedInvitations,
      "Invitations retrieved successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const cancelInvitation = async (
  req: RequestWithUser<OrganizationInvitationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const invitationId = req.params.invitationId;

    const invitation = await getInvitationById(invitationId);
    if (!invitation) {
      throw httpError(404, "Invitation not found");
    }

    if (invitation.organization_id !== organizationId) {
      throw httpError(403, "Invitation does not belong to this organization");
    }

    if (invitation.used_at) {
      throw httpError(400, "Invitation has already been used");
    }

    await deleteInvitation(invitationId);

    return sendSuccess(res, null, "Invitation cancelled successfully");
  } catch (error) {
    next(error);
  }
};

export const getInvitation = async (
  req: Request<TokenParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.params.token;

    const invitation = await validateInvitationToken(token, "org_invite");

    const organization = invitation.organization_id
      ? await getOrganizationById(invitation.organization_id)
      : null;

    return sendSuccess(
      res,
      {
        email: invitation.email,
        role: invitation.role,
        is_existing_user: invitation.is_existing_user,
        organization: organization
          ? {
              id: organization.id,
              name: organization.name,
              slug: organization.slug,
            }
          : null,
      },
      "Invitation is valid",
    );
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (
  req: Request<TokenParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.params.token;
    const { password } = req.body;

    const outcome = await withTransaction(db, async (client) => {
      const invitation = await validateInvitationToken(
        token,
        "org_invite",
        client,
      );

      if (!invitation.organization_id || !invitation.role) {
        throw httpError(400, "Invalid organization invitation");
      }

      let userId: string;
      // An existing account can carry MFA and a deactivated flag; a freshly
      // created one never does.
      let mfaRequired = false;

      if (invitation.is_existing_user) {
        // Existing user - verify password
        if (!password) {
          throw httpError(400, "Password is required to verify your identity");
        }

        const user = await getUserWithPassword(invitation.email);
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
        // New user - create account
        if (!password) {
          throw httpError(400, "Password is required to create your account");
        }

        const passwordHash = await hashPassword(password);
        const user = await createUser(
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

      await addOrganizationMember(
        invitation.organization_id,
        {
          user_id: userId,
          role: invitation.role as "admin" | "member" | "viewer",
        },
        invitation.invited_by || null,
        client,
      );

      await markInvitationUsed(invitation.id!, client);

      // The user has proven password + invite-token possession, so the org-join
      // is committed — but an MFA-enabled account must clear its second factor
      // before it gets a session, exactly as login requires. Issuing auth
      // cookies here would let a known password skip MFA entirely. (S2)
      if (mfaRequired) {
        return { kind: "mfa_required" as const, invitation, userId };
      }

      const accessKey = process.env.USER_ACCESS_KEY;
      if (!accessKey) {
        throw httpError(500, "Server configuration error");
      }

      const accessToken = jwt.sign(
        {
          role_id: userId,
          role_type: "user",
          email_verified: true,
        },
        accessKey,
        { expiresIn: "15m" },
      );

      const { token: refreshToken } = await addRefresh(
        {
          role_id: userId,
          role_type: "user",
        },
        client,
      );

      return {
        kind: "logged_in" as const,
        invitation,
        userId,
        accessToken,
        refreshToken,
      };
    });

    if (outcome.kind === "mfa_required") {
      const challengeToken = createMfaChallengeToken(outcome.userId, "user");
      setMfaChallengeCookie(res, challengeToken);

      return sendSuccess(
        res,
        {
          mfa_required: true,
          organization_id: outcome.invitation.organization_id,
          role: outcome.invitation.role,
        },
        "MFA verification required",
      );
    }

    setAuthCookies(res, outcome.accessToken, outcome.refreshToken);

    return sendSuccess(
      res,
      {
        user_id: outcome.userId,
        organization_id: outcome.invitation.organization_id,
        role: outcome.invitation.role,
      },
      outcome.invitation.is_existing_user
        ? "You have joined the organization"
        : "Account created and joined the organization",
    );
  } catch (error) {
    next(error);
  }
};
