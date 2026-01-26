import { Response, NextFunction } from "express";
import { RequestWithUser } from "../types";
import { getOrganizationById } from "../models/organization.models";
import {
  getOrganizationMember,
  getUserRoleInOrg,
} from "../models/organizationMembers.models";
import { OrganizationRoleType } from "@auth-boilerplate/shared";

// Middleware to check if user is a member of the organization
export const organizationMemberMiddleware = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.params.organizationId as string;

    if (!organizationId) {
      throw { status: 400, msg: "Organization ID is required" };
    }

    // Get organization to verify it exists
    const organization = await getOrganizationById(organizationId);

    if (!organization) {
      throw { status: 404, msg: "Organization not found" };
    }

    // Verify user is a member of this organization
    const membership = await getOrganizationMember(organizationId, req.user!.role_id);

    if (!membership) {
      throw { status: 403, msg: "Access denied: Not a member of this organization" };
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
        throw { status: 400, msg: "Organization ID is required" };
      }

      // Get organization to verify it exists
      const organization = await getOrganizationById(organizationId);

      if (!organization) {
        throw { status: 404, msg: "Organization not found" };
      }

      // Get user's role in this organization
      const userRole = await getUserRoleInOrg(organizationId, req.user!.role_id);

      if (!userRole) {
        throw { status: 403, msg: "Access denied: Not a member of this organization" };
      }

      if (!allowedRoles.includes(userRole)) {
        throw {
          status: 403,
          msg: `Access denied: Requires one of these roles: ${allowedRoles.join(", ")}`,
        };
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
