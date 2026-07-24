import { Response, NextFunction } from "express";
import { RequestWithUser } from "../types";
import { getOrganizationById } from "../models/organization.models";
import {
  getOrganizationMember,
  getUserRoleInOrg,
} from "../models/organizationMembers.models";
import { OrganizationRoleType } from "@auth-boilerplate/shared";
import { httpError } from "../utils/httpError";

// Middleware to check if user is a member of the organization
export const organizationMemberMiddleware = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;

    if (!organizationId) {
      throw httpError(400, "Organization ID is required");
    }

    // Get organization to verify it exists
    const organization = await getOrganizationById(organizationId);

    if (!organization) {
      throw httpError(404, "Organization not found");
    }

    // Verify user is a member of this organization
    const membership = await getOrganizationMember(organizationId, req.user!.role_id);

    if (!membership) {
      throw httpError(403, "Access denied: Not a member of this organization");
    }

    req.organization = organization;
    req.organizationMembership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireOrgRole = (allowedRoles: OrganizationRoleType[]) => {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.params.organizationId as string;

      if (!organizationId) {
        throw httpError(400, "Organization ID is required");
      }

      // Get organization to verify it exists
      const organization = await getOrganizationById(organizationId);

      if (!organization) {
        throw httpError(404, "Organization not found");
      }

      // Get user's role in this organization
      const userRole = await getUserRoleInOrg(organizationId, req.user!.role_id);

      if (!userRole) {
        throw httpError(403, "Access denied: Not a member of this organization");
      }

      if (!allowedRoles.includes(userRole)) {
        throw httpError(403, `Access denied: Requires one of these roles: ${allowedRoles.join(", ")}`);
      }

      req.organization = organization;
      req.organizationRole = userRole;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requireOrgOwner = requireOrgRole(["owner"]);
export const requireOrgAdmin = requireOrgRole(["owner", "admin"]);
export const requireOrgMember = requireOrgRole(["owner", "admin", "member"]);
export const requireOrgViewer = requireOrgRole(["owner", "admin", "member", "viewer"]);
