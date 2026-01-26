import express from "express";

import { validateParams, validateBody } from "../../middleware/validate";
import { userParamsSchema } from "../../types/RouteParams";
import { createUserSchema, updateUserSchema } from "../../types";
import {
  createUserHandler,
  getAllUsers,
  getUserByIdHandler,
  updateUser,
  deleteUserHandler,
  changeUserPassword,
} from "../../controllers/admin/adminUsers";
import { authoriseUser } from "../../middleware/authoriseUser";

const router = express.Router();

router.post(
  "/",
  authoriseUser(["admin"]),
  validateBody(createUserSchema),
  createUserHandler
);

router.get("/", authoriseUser(["admin"]), getAllUsers);

router.put(
  "/reset-password/:userId",
  authoriseUser(["admin"]),
  validateParams(userParamsSchema),
  changeUserPassword
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

export default router;
