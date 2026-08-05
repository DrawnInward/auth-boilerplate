import { Request, Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import {
  validateInvitationToken,
  listInvitationsByOrganization,
  deleteInvitation,
  getInvitationById,
} from "../../models/invitations.models";
import { getOrganizationById } from "../../models/organization.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { getValidatedQuery } from "../../middleware/validate";
import type {
  OrganizationInvitationParams,
  OrganizationParams,
  PaginationQuery,
  TokenParams,
} from "@auth-boilerplate/shared";
import { services } from "../../services";
import { setAuthCookies } from "../../utils";
import { setMfaChallengeCookie } from "../../utils/mfaChallenge";
import { httpError } from "../../utils/httpError";

import "../../utils/loadEnv";

export const inviteMember = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { email, role } = req.body;

    const invitation = await services.invitation.inviteMember({
      organizationId,
      email,
      role,
      invitedBy: req.user!.role_id,
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

    const { start, invitation, userId } =
      await services.invitation.acceptInvitation(token, password);

    if (start.kind === "mfa_required") {
      setMfaChallengeCookie(res, start.challengeToken);

      return sendSuccess(
        res,
        {
          mfa_required: true,
          organization_id: invitation.organization_id,
          role: invitation.role,
        },
        "MFA verification required",
      );
    }

    setAuthCookies(res, start.accessToken, start.refreshToken);

    return sendSuccess(
      res,
      {
        user_id: userId,
        organization_id: invitation.organization_id,
        role: invitation.role,
      },
      invitation.is_existing_user
        ? "You have joined the organization"
        : "Account created and joined the organization",
    );
  } catch (error) {
    next(error);
  }
};
