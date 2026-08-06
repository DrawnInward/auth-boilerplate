import express from "express";

import {
  validateParams,
  validateBody,
  validateQuery,
} from "../../middleware/validate";
import {
  adminParamsSchema,
  adminsQuerySchema,
  inviteAdminSchema,
} from "@auth-boilerplate/shared";
import {
  getAllAdmins,
  createAdminHandler,
  disableAdminHandler,
} from "../../controllers/admin/adminAdmins.controller";
import { authoriseUser } from "../../middleware/authoriseUser";
import { requireRootAdmin } from "../../middleware/requireRootAdmin";

const router = express.Router();

// GET /api/admin/admins - List platform admins (any admin)
router.get(
  "/",
  authoriseUser(["admin"]),
  validateQuery(adminsQuerySchema),
  getAllAdmins,
);

// POST /api/admin/admins - Invite a new platform admin (root only)
router.post(
  "/",
  authoriseUser(["admin"]),
  requireRootAdmin,
  validateBody(inviteAdminSchema),
  createAdminHandler,
);

// POST /api/admin/admins/:adminId/disable - Deactivate an admin (root only)
router.post(
  "/:adminId/disable",
  authoriseUser(["admin"]),
  requireRootAdmin,
  validateParams(adminParamsSchema),
  disableAdminHandler,
);

export default router;
