import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import { validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { googleLinkSchema } from "@auth-boilerplate/shared";
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  linkGoogleAccount,
  unlinkGoogle,
} from "../../controllers/user/oauth.controller";

const router = express.Router();

router.get("/google", authLimiter, initiateGoogleAuth);

router.get("/google/callback", authLimiter, handleGoogleCallback);

router.post(
  "/google/link",
  authLimiter,
  validateBody(googleLinkSchema),
  linkGoogleAccount,
);

router.post("/google/unlink", authoriseUser(["user"]), unlinkGoogle);

export default router;
