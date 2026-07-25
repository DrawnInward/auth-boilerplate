import express from "express";
import { validateParams, validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { tokenParamsSchema } from "@auth-boilerplate/shared";
import { acceptInviteSchema } from "../../types/Invitation";
import {
  getInvitation,
  acceptInvitation,
} from "../../controllers/user/invitations.controller";

const router = express.Router();

// GET /api/invitations/:token - Get invitation details (public, rate limited)
router.get(
  "/:token",
  authLimiter,
  validateParams(tokenParamsSchema),
  getInvitation,
);

// POST /api/invitations/:token/accept - Accept invitation (public, rate limited)
router.post(
  "/:token/accept",
  authLimiter,
  validateParams(tokenParamsSchema),
  validateBody(acceptInviteSchema),
  acceptInvitation,
);

export default router;
