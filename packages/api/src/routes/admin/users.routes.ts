import express from "express";

import {
  validateParams,
  validateBody,
  validateQuery,
} from "../../middleware/validate";
import {
  adminInviteUserSchema,
  updateUserSchema,
  userParamsSchema,
  usersQuerySchema,
} from "@auth-boilerplate/shared";
import {
  createUserHandler,
  getAllUsers,
  getUserStatsHandler,
  getUserByIdHandler,
  updateUser,
  deleteUserHandler,
  sendPasswordReset,
  updateOrgPermission,
  disableUserMfa,
} from "../../controllers/admin/adminUsers.controller";
import { authoriseUser } from "../../middleware/authoriseUser";

const router = express.Router();

router.post(
  "/",
  authoriseUser(["admin"]),
  validateBody(adminInviteUserSchema),
  createUserHandler,
);

router.get(
  "/",
  authoriseUser(["admin"]),
  validateQuery(usersQuerySchema),
  getAllUsers,
);

// Registered before the /:userId param routes so "stats" is never captured as
// a userId.
router.get("/stats", authoriseUser(["admin"]), getUserStatsHandler);

router.post(
  "/reset-password/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  sendPasswordReset,
);

router.get(
  "/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  getUserByIdHandler,
);

router.put(
  "/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  validateBody(updateUserSchema),
  updateUser,
);

router.delete(
  "/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  deleteUserHandler,
);

router.patch(
  "/:userId/org-permission",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  updateOrgPermission,
);

router.post(
  "/:userId/disable-mfa",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  disableUserMfa,
);

export default router;
