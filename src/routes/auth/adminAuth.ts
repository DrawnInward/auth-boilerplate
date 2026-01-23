import express from "express";
import { validateBody } from "../../middleware/validate";
import { loginAdminSchema } from "../../types";
import { login } from "../../controllers/admin/adminAuth";

const router = express.Router();

router.post(
  "/login",
  validateBody(loginAdminSchema),
  login
);

export default router;