import { Request, Response, NextFunction } from "express";
import {
  createOrganization,
  getOrganizations,
  getOrganizationById,
  modifyOrganization,
  deleteOrganization,
  getOrganizationStats,
  getOrganizationWithMemberCount,
} from "../../models/organization.models";
import {
  addOrganizationMember,
  getOrganizationMembers,
  updateMemberRole,
  removeOrganizationMember,
} from "../../models/organizationMembers.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { getValidatedQuery } from "../../middleware/validate";
import type {
  OrganizationMemberParams,
  OrganizationParams,
  OrganizationsQuery,
  PaginationQuery,
} from "@auth-boilerplate/shared";
import db from "../../database/db";
import { httpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

export const createOrganizationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, slug, owner_id } = req.body;

    if (!owner_id) {
      throw httpError(400, "owner_id is required");
    }

    const newOrg = await withTransaction(db, async (client) => {
      const org = await createOrganization({ name, slug, owner_id }, client);

      await addOrganizationMember(
        org.id,
        { user_id: owner_id, role: "owner" },
        null,
        client,
      );

      return org;
    });

    return sendCreated(res, newOrg, "Organization created successfully");
  } catch (error) {
    next(error);
  }
};

export const getAllOrganizations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { owner_id, user_id, limit, offset } =
      getValidatedQuery<OrganizationsQuery>(res);
    const filters = { owner_id, user_id };
    const pagination = { limit, offset };

    const organizations = await getOrganizations(filters, pagination);

    return sendSuccess(
      res,
      organizations,
      "Organizations retrieved successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const getOrganizationStatsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const stats = await getOrganizationStats();

    return sendSuccess(res, stats, "Organization stats retrieved successfully");
  } catch (error) {
    next(error);
  }
};

export const getOrganizationByIdHandler = async (
  req: Request<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;

    const organization = await getOrganizationWithMemberCount(organizationId);

    if (!organization) {
      throw httpError(404, "Organization not found");
    }

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
  req: Request<OrganizationParams>,
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
  req: Request<OrganizationParams>,
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

export const getOrganizationMembersHandler = async (
  req: Request<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { limit, offset } = getValidatedQuery<PaginationQuery>(res);

    const org = await getOrganizationById(organizationId);
    if (!org) {
      throw httpError(404, "Organization not found");
    }

    const members = await getOrganizationMembers(organizationId, {
      limit,
      offset,
    });

    return sendSuccess(res, members, "Members retrieved successfully");
  } catch (error) {
    next(error);
  }
};

export const addOrganizationMemberHandler = async (
  req: Request<OrganizationParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const { user_id, role } = req.body;

    const org = await getOrganizationById(organizationId);
    if (!org) {
      throw httpError(404, "Organization not found");
    }

    const newMember = await addOrganizationMember(organizationId, {
      user_id,
      role: role || "member",
    });

    return sendCreated(res, newMember, "Member added successfully");
  } catch (error) {
    next(error);
  }
};

export const updateOrganizationMemberHandler = async (
  req: Request<OrganizationMemberParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.params.userId;
    const { role } = req.body;

    const org = await getOrganizationById(organizationId);
    if (!org) {
      throw httpError(404, "Organization not found");
    }

    const updatedMember = await updateMemberRole(organizationId, userId, role);

    return sendSuccess(res, updatedMember, "Member role updated successfully");
  } catch (error) {
    next(error);
  }
};

export const removeOrganizationMemberHandler = async (
  req: Request<OrganizationMemberParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.params.userId;

    const org = await getOrganizationById(organizationId);
    if (!org) {
      throw httpError(404, "Organization not found");
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
