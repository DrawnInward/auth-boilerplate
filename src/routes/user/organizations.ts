import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import {
  organizationMemberMiddleware,
  requireOrgAdmin,
  requireOrgOwner,
} from "../../middleware/organizationMiddleware";
import { validateParams, validateBody } from "../../middleware/validate";
import {
  organizationParamsSchema,
  organizationMemberParamsSchema,
} from "../../types/RouteParams";
import {
  createOrganizationDtoSchema,
  updateOrganizationDtoSchema,
  addOrganizationMemberDtoSchema,
  updateMemberRoleDtoSchema,
} from "../../../shared/src/types";
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
} from "../../controllers/user/organizations";

const router = express.Router();

// GET /api/organizations - Get all organizations user is a member of
router.get("/", authoriseUser(["user"]), getMyOrganizations);

// POST /api/organizations - Create a new organization
router.post(
  "/",
  authoriseUser(["user"]),
  validateBody(createOrganizationDtoSchema),
  createOrganizationHandler
);

// GET /api/organizations/:organizationId - Get organization details
router.get(
  "/:organizationId",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  organizationMemberMiddleware,
  getOrganization
);

// PUT /api/organizations/:organizationId - Update organization (owner/admin only)
router.put(
  "/:organizationId",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  validateBody(updateOrganizationDtoSchema),
  requireOrgAdmin,
  updateOrganization
);

// DELETE /api/organizations/:organizationId - Delete organization (owner only)
router.delete(
  "/:organizationId",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  requireOrgOwner,
  deleteOrganizationHandler
);

// GET /api/organizations/:organizationId/members - Get organization members
router.get(
  "/:organizationId/members",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  organizationMemberMiddleware,
  getMembers
);

// POST /api/organizations/:organizationId/members - Add a member (owner/admin only)
router.post(
  "/:organizationId/members",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  validateBody(addOrganizationMemberDtoSchema),
  requireOrgAdmin,
  addMember
);

// PUT /api/organizations/:organizationId/members/:userId - Update member role (owner/admin only)
router.put(
  "/:organizationId/members/:userId",
  authoriseUser(["user"]),
  validateParams(organizationMemberParamsSchema),
  validateBody(updateMemberRoleDtoSchema),
  requireOrgAdmin,
  updateMember
);

// DELETE /api/organizations/:organizationId/members/:userId - Remove member (owner/admin, or self)
router.delete(
  "/:organizationId/members/:userId",
  authoriseUser(["user"]),
  validateParams(organizationMemberParamsSchema),
  organizationMemberMiddleware,
  removeMember
);

// POST /api/organizations/:organizationId/transfer-ownership - Transfer ownership (owner only)
router.post(
  "/:organizationId/transfer-ownership",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  requireOrgOwner,
  transferOwnershipHandler
);

// POST /api/organizations/:organizationId/leave - Leave organization
router.post(
  "/:organizationId/leave",
  authoriseUser(["user"]),
  validateParams(organizationParamsSchema),
  organizationMemberMiddleware,
  leaveOrganization
);

export default router;
