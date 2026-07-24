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
    const { owner_id, user_id, limit, offset } = req.query;

    const filters: any = {};
    if (owner_id) filters.owner_id = owner_id as string;
    if (user_id) filters.user_id = user_id as string;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (offset) pagination.offset = parseInt(offset as string);

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
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId as string;

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
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId as string;
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
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId as string;

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
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const { limit, offset } = req.query;

    const org = await getOrganizationById(organizationId);
    if (!org) {
      throw httpError(404, "Organization not found");
    }

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (offset) pagination.offset = parseInt(offset as string);

    const members = await getOrganizationMembers(organizationId, pagination);

    return sendSuccess(res, members, "Members retrieved successfully");
  } catch (error) {
    next(error);
  }
};

export const addOrganizationMemberHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId as string;
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
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const userId = req.params.userId as string;
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
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const userId = req.params.userId as string;

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
