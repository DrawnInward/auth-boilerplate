import express from "express";

import { validateParams, validateBody } from "../../middleware/validate";
import { userParamsSchema } from "../../types/RouteParams";
import { adminInviteUserSchema, updateUserSchema } from "../../types";
import {
  createUserHandler,
  getAllUsers,
  getUserByIdHandler,
  updateUser,
  deleteUserHandler,
  sendPasswordReset,
  updateOrgPermission,
  disableUserMfa,
} from "../../controllers/admin/adminUsers";
import { authoriseUser } from "../../middleware/authoriseUser";

const router = express.Router();

router.post(
  "/",
  authoriseUser(["admin"]),
  validateBody(adminInviteUserSchema),
  createUserHandler
);

router.get("/", authoriseUser(["admin"]), getAllUsers);

router.post(
  "/reset-password/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  sendPasswordReset
);

router.get(
  "/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  getUserByIdHandler
);

router.put(
  "/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  validateBody(updateUserSchema),
  updateUser
);

router.delete(
  "/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  deleteUserHandler
);

router.patch(
  "/:userId/org-permission",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  updateOrgPermission
);

router.post(
  "/:userId/disable-mfa",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  disableUserMfa
);

export default router;
