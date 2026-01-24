import express from "express";
import { validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { loginAdminSchema } from "../../types";
import { login } from "../../controllers/admin/adminAuth";

const router = express.Router();

router.post(
  "/login",
  authLimiter,
  validateBody(loginAdminSchema),
  login
);

export default router;