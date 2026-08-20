import { Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import {
  getOrganizationsByUserId,
  modifyOrganization,
  deleteOrganization,
} from "../../models/organization.models";
import {
  addOrganizationMember,
  getOrganizationMembers,
  updateMemberRole,
  removeOrganizationMember,
  transferOwnership,
} from "../../models/organizationMembers.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { services } from "../../services";
import { getValidatedQuery } from "../../middleware/validate";
import type {
  PaginationQuery,
  OrganizationParams,
  OrganizationMemberParams,
} from "@auth-boilerplate/shared";
import { httpError } from "../../utils/httpError";

export const getMyOrganizations = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user!.role_id;
    const { limit, offset } = getValidatedQuery<PaginationQuery>(res);
    const pagination = { limit, offset };

    const organizations = await getOrganizationsByUserId(userId, pagination);

    return sendSuccess(
      res,
      organizations,
      "Organizations retrieved successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const createOrganizationHandler = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, slug } = req.body;
    const newOrg = await services.organization.createOrganization({
      name,
      slug,
      ownerId: req.user!.role_id,
    });

    return sendCreated(res, newOrg, "Organization created successfully");
  } catch (error) {
    next(error);
  }
};

export const getOrganization = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organization = {
      ...req.organization,
      role: req.organizationMembership?.role,
    };

    return sendSuccess(
      res,
      organization,
      "Organization retrieved successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const updateOrganization = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const updates = req.body;

    const updatedOrganization = await modifyOrganization(
      organizationId,
      updates,
    );

    return sendSuccess(
      res,
      updatedOrganization,
      "Organization updated successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const deleteOrganizationHandler = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;

    const deletedOrganization = await deleteOrganization(organizationId);

    return sendSuccess(
      res,
      deletedOrganization,
      "Organization deleted successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const getMembers = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { limit, offset } = getValidatedQuery<PaginationQuery>(res);
    const pagination = { limit, offset };

    const members = await getOrganizationMembers(organizationId, pagination);

    return sendSuccess(res, members, "Members retrieved successfully");
  } catch (error) {
    next(error);
  }
};

export const addMember = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { user_id, role } = req.body;
    const invitedBy = req.user!.role_id;

    if (role === "owner") {
      throw httpError(
        400,
        "Cannot add member as owner. Use transfer ownership.",
      );
    }

    const newMember = await addOrganizationMember(
      organizationId,
      { user_id, role: role || "member" },
      invitedBy,
    );

    return sendCreated(res, newMember, "Member added successfully");
  } catch (error) {
    next(error);
  }
};

export const updateMember = async (
  req: RequestWithUser<OrganizationMemberParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.params.userId;
    const { role } = req.body;

    const updatedMember = await updateMemberRole(organizationId, userId, role);

    return sendSuccess(res, updatedMember, "Member role updated successfully");
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (
  req: RequestWithUser<OrganizationMemberParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.params.userId;
    const currentUserId = req.user!.role_id;

    // Allow users to remove themselves (leave org)
    // Or admins/owners to remove others
    if (userId !== currentUserId) {
      const currentUserRole = req.organizationMembership!.role;
      if (currentUserRole !== "owner" && currentUserRole !== "admin") {
        throw httpError(403, "Only owners and admins can remove other members");
      }
    }

    const removedMember = await removeOrganizationMember(
      organizationId,
      userId,
    );

    return sendSuccess(res, removedMember, "Member removed successfully");
  } catch (error) {
    next(error);
  }
};

export const transferOwnershipHandler = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { new_owner_id } = req.body;
    const currentOwnerId = req.user!.role_id;

    const result = await transferOwnership(
      organizationId,
      currentOwnerId,
      new_owner_id,
    );

    return sendSuccess(res, result, "Ownership transferred successfully");
  } catch (error) {
    next(error);
  }
};

// POST /api/organizations/:organizationId/leave
// Leave an organization (cannot leave if owner)
export const leaveOrganization = async (
  req: RequestWithUser<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.user!.role_id;

    const removedMember = await removeOrganizationMember(
      organizationId,
      userId,
    );

    return sendSuccess(res, removedMember, "Left organization successfully");
  } catch (error) {
    next(error);
  }
};
