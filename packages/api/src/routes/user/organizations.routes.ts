import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import {
  organizationMemberMiddleware,
  requireOrgAdmin,
  requireOrgOwner,
} from "../../middleware/organizationMiddleware";
import { canCreateOrg } from "../../middleware/canCreateOrg";
import {
  validateParams,
  validateBody,
  validateQuery,
} from "../../middleware/validate";
import {
  inviteMemberSchema,
  organizationParamsSchema,
  organizationMemberParamsSchema,
  organizationInvitationParamsSchema,
  createOrganizationDtoSchema,
  updateOrganizationDtoSchema,
  addOrganizationMemberDtoSchema,
  updateMemberRoleDtoSchema,
  paginationQuerySchema,
} from "@auth-boilerplate/shared";
import {
  getMyOrganizations,
  createOrganizationHandler,
  getOrganization,
  updateOrganization,
  deleteOrganizationHandler,
  getMembers,
  addMember,
  updateMember,
  removeMember,
  transferOwnershipHandler,
  leaveOrganization,
} from "../../controllers/user/organizations.controller";
import {
  inviteMember,
  listInvitations,
  cancelInvitation,
} from "../../controllers/user/invitations.controller";

const router = express.Router();

// GET /api/organizations - Get all organizations user is a member of
router.get(
  "/",
  authoriseUser(["user"]),
  validateQuery(paginationQuerySchema),
  getMyOrganizations,
);

// POST /api/organizations - Create a new organization
router.post(
  "/",
  authoriseUser(["user"]),
  canCreateOrg,
  validateBody(createOrganizationDtoSchema),
  createOrganizationHandler,
);

// GET /api/organizations/:organizationId - Get organization details
router.get(
  "/:organizationId",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  organizationMemberMiddleware,
  getOrganization,
);

// PUT /api/organizations/:organizationId - Update organization (owner/admin only)
router.put(
  "/:organizationId",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  validateBody(updateOrganizationDtoSchema),
  requireOrgAdmin,
  updateOrganization,
);

// DELETE /api/organizations/:organizationId - Delete organization (owner only)
router.delete(
  "/:organizationId",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  requireOrgOwner,
  deleteOrganizationHandler,
);

// GET /api/organizations/:organizationId/members - Get organization members
router.get(
  "/:organizationId/members",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  validateQuery(paginationQuerySchema),
  organizationMemberMiddleware,
  getMembers,
);

// POST /api/organizations/:organizationId/members - Add a member (owner/admin only)
router.post(
  "/:organizationId/members",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  validateBody(addOrganizationMemberDtoSchema),
  requireOrgAdmin,
  addMember,
);

// PUT /api/organizations/:organizationId/members/:userId - Update member role (owner/admin only)
router.put(
  "/:organizationId/members/:userId",
  authoriseUser(["user"]),
  validateParams(organizationMemberParamsSchema),
  validateBody(updateMemberRoleDtoSchema),
  requireOrgAdmin,
  updateMember,
);

// DELETE /api/organizations/:organizationId/members/:userId - Remove member (owner/admin, or self)
router.delete(
  "/:organizationId/members/:userId",
  authoriseUser(["user"]),
  validateParams(organizationMemberParamsSchema),
  organizationMemberMiddleware,
  removeMember,
);

// POST /api/organizations/:organizationId/transfer-ownership - Transfer ownership (owner only)
router.post(
  "/:organizationId/transfer-ownership",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  requireOrgOwner,
  transferOwnershipHandler,
);

// POST /api/organizations/:organizationId/leave - Leave organization
router.post(
  "/:organizationId/leave",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  organizationMemberMiddleware,
  leaveOrganization,
);

// POST /api/organizations/:organizationId/invite - Invite a member (owner/admin only)
router.post(
  "/:organizationId/invite",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  validateBody(inviteMemberSchema),
  requireOrgAdmin,
  inviteMember,
);

// GET /api/organizations/:organizationId/invitations - List pending invitations (owner/admin only)
router.get(
  "/:organizationId/invitations",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  validateQuery(paginationQuerySchema),
  requireOrgAdmin,
  listInvitations,
);

// DELETE /api/organizations/:organizationId/invitations/:invitationId - Cancel invitation (owner/admin only)
router.delete(
  "/:organizationId/invitations/:invitationId",
  authoriseUser(["user"]),
  validateParams(organizationInvitationParamsSchema),
  requireOrgAdmin,
  cancelInvitation,
);

export default router;
