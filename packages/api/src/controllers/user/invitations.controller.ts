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

    const { invitation, userId, accessToken, refreshToken } =
      await withTransaction(db, async (client) => {
        const invitation = await validateInvitationToken(
          token,
          "org_invite",
          client,
        );

        if (!invitation.organization_id || !invitation.role) {
          throw httpError(400, "Invalid organization invitation");
        }

        let userId: string;

        if (invitation.is_existing_user) {
          // Existing user - verify password
          if (!password) {
            throw httpError(
              400,
              "Password is required to verify your identity",
            );
          }

          const user = await getUserWithPassword(invitation.email);
          if (!user) {
            throw httpError(404, "User not found");
          }

          const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash!,
          );
          if (!passwordMatch) {
            throw httpError(401, "Invalid password");
          }

          userId = user.user_id!;
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

        return { invitation, userId, accessToken, refreshToken };
      });

    setAuthCookies(res, accessToken, refreshToken);

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
