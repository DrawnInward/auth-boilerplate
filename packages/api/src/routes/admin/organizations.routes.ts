import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import { validateParams, validateBody } from "../../middleware/validate";
import {
  organizationParamsSchema,
  organizationMemberParamsSchema,
  createOrganizationDtoSchema,
  updateOrganizationDtoSchema,
  addOrganizationMemberDtoSchema,
  updateMemberRoleDtoSchema,
} from "@auth-boilerplate/shared";
import {
  createOrganizationHandler,
  getAllOrganizations,
  getOrganizationStatsHandler,
  getOrganizationByIdHandler,
  updateOrganization,
  deleteOrganizationHandler,
  getOrganizationMembersHandler,
  addOrganizationMemberHandler,
  updateOrganizationMemberHandler,
  removeOrganizationMemberHandler,
} from "../../controllers/admin/adminOrganizations.controller";

const router = express.Router();

// POST /api/admin/organizations - Create organization
router.post(
  "/",
  authoriseUser(["admin"]),
  validateBody(
    createOrganizationDtoSchema.extend({
      owner_id: createOrganizationDtoSchema.shape.name, // Reuse string validation, owner_id is required for admin
    })
  ),
  createOrganizationHandler
);

// GET /api/admin/organizations - Get all organizations
router.get("/", authoriseUser(["admin"]), getAllOrganizations);

// GET /api/admin/organizations/stats - Get organization statistics
router.get("/stats", authoriseUser(["admin"]), getOrganizationStatsHandler);

// GET /api/admin/organizations/:organizationId - Get organization by ID
router.get(
  "/:organizationId",
  authoriseUser(["admin"]),
  validateParams(organizationParamsSchema),
  getOrganizationByIdHandler
);

// PUT /api/admin/organizations/:organizationId - Update organization
router.put(
  "/:organizationId",
  authoriseUser(["admin"]),
  validateParams(organizationParamsSchema),
  validateBody(updateOrganizationDtoSchema),
  updateOrganization
);

// DELETE /api/admin/organizations/:organizationId - Delete organization
router.delete(
  "/:organizationId",
  authoriseUser(["admin"]),
  validateParams(organizationParamsSchema),
  deleteOrganizationHandler
);

// GET /api/admin/organizations/:organizationId/members - Get members
router.get(
  "/:organizationId/members",
  authoriseUser(["admin"]),
  validateParams(organizationParamsSchema),
  getOrganizationMembersHandler
);

// POST /api/admin/organizations/:organizationId/members - Add member
router.post(
  "/:organizationId/members",
  authoriseUser(["admin"]),
  validateParams(organizationParamsSchema),
  validateBody(addOrganizationMemberDtoSchema),
  addOrganizationMemberHandler
);

// PUT /api/admin/organizations/:organizationId/members/:userId - Update member role
router.put(
  "/:organizationId/members/:userId",
  authoriseUser(["admin"]),
  validateParams(organizationMemberParamsSchema),
  validateBody(updateMemberRoleDtoSchema),
  updateOrganizationMemberHandler
);

// DELETE /api/admin/organizations/:organizationId/members/:userId - Remove member
router.delete(
  "/:organizationId/members/:userId",
  authoriseUser(["admin"]),
  validateParams(organizationMemberParamsSchema),
  removeOrganizationMemberHandler
);

export default router;
