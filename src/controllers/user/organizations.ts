import { Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import {
  createOrganization,
  getOrganizationById,
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
import db from "../../database/db";

// GET /api/organizations
// Get all organizations the current user is a member of
export const getMyOrganizations = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.role_id;
    const { limit, offset } = req.query;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (offset) pagination.offset = parseInt(offset as string);

    const organizations = await getOrganizationsByUserId(userId, pagination);

    return sendSuccess(res, organizations, "Organizations retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// POST /api/organizations
// Create a new organization (current user becomes owner)
export const createOrganizationHandler = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const userId = req.user!.role_id;
    const { name, slug } = req.body;

    // Create the organization
    const newOrg = await createOrganization(
      { name, slug, owner_id: userId },
      client
    );

    // Add the creator as owner member
    await addOrganizationMember(
      newOrg.id,
      { user_id: userId, role: "owner" },
      null,
      client
    );

    await client.query("COMMIT");

    return sendCreated(res, newOrg, "Organization created successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

// GET /api/organizations/:organizationId
// Get a single organization (must be a member)
// Organization data is attached by middleware
export const getOrganization = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organization = req.organization;

    return sendSuccess(res, organization, "Organization retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// PUT /api/organizations/:organizationId
// Update organization (must be owner or admin)
export const updateOrganization = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const updates = req.body;

    const updatedOrganization = await modifyOrganization(organizationId, updates);

    return sendSuccess(
      res,
      updatedOrganization,
      "Organization updated successfully"
    );
  } catch (error) {
    next(error);
  }
};

// DELETE /api/organizations/:organizationId
// Delete organization (must be owner)
export const deleteOrganizationHandler = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;

    const deletedOrganization = await deleteOrganization(organizationId);

    return sendSuccess(
      res,
      deletedOrganization,
      "Organization deleted successfully"
    );
  } catch (error) {
    next(error);
  }
};

// GET /api/organizations/:organizationId/members
// Get organization members (must be a member)
export const getMembers = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const { limit, offset } = req.query;

    const pagination: any = {};
    if (limit) pagination.limit = parseInt(limit as string);
    if (offset) pagination.offset = parseInt(offset as string);

    const members = await getOrganizationMembers(organizationId, pagination);

    return sendSuccess(res, members, "Members retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// POST /api/organizations/:organizationId/members
// Add a member to organization (must be owner or admin)
export const addMember = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const { user_id, role } = req.body;
    const invitedBy = req.user!.role_id;

    // Cannot add someone as owner via this endpoint
    if (role === "owner") {
      throw { status: 400, msg: "Cannot add member as owner. Use transfer ownership." };
    }

    const newMember = await addOrganizationMember(
      organizationId,
      { user_id, role: role || "member" },
      invitedBy
    );

    return sendCreated(res, newMember, "Member added successfully");
  } catch (error) {
    next(error);
  }
};

// PUT /api/organizations/:organizationId/members/:userId
// Update member role (must be owner or admin)
export const updateMember = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const userId = req.params.userId as string;
    const { role } = req.body;

    const updatedMember = await updateMemberRole(organizationId, userId, role);

    return sendSuccess(res, updatedMember, "Member role updated successfully");
  } catch (error) {
    next(error);
  }
};

// DELETE /api/organizations/:organizationId/members/:userId
// Remove a member (must be owner or admin, or self for leaving)
export const removeMember = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const userId = req.params.userId as string;
    const currentUserId = req.user!.role_id;

    // Allow users to remove themselves (leave org)
    // Or admins/owners to remove others
    if (userId !== currentUserId) {
      // Check if current user has permission (middleware should handle this)
      const currentUserRole = req.organizationRole;
      if (currentUserRole !== "owner" && currentUserRole !== "admin") {
        throw { status: 403, msg: "Only owners and admins can remove other members" };
      }
    }

    const removedMember = await removeOrganizationMember(organizationId, userId);

    return sendSuccess(res, removedMember, "Member removed successfully");
  } catch (error) {
    next(error);
  }
};

// POST /api/organizations/:organizationId/transfer-ownership
// Transfer ownership to another member (must be owner)
export const transferOwnershipHandler = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const { new_owner_id } = req.body;
    const currentOwnerId = req.user!.role_id;

    const result = await transferOwnership(
      organizationId,
      currentOwnerId,
      new_owner_id
    );

    return sendSuccess(res, result, "Ownership transferred successfully");
  } catch (error) {
    next(error);
  }
};

// POST /api/organizations/:organizationId/leave
// Leave an organization (cannot leave if owner)
export const leaveOrganization = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;
    const userId = req.user!.role_id;

    const removedMember = await removeOrganizationMember(organizationId, userId);

    return sendSuccess(res, removedMember, "Left organization successfully");
  } catch (error) {
    next(error);
  }
};
