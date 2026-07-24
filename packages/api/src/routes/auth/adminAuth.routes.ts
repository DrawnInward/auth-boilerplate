import express from "express";
import { validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { authoriseUser } from "../../middleware/authoriseUser";
import { loginAdminSchema } from "../../types";
import {
  mfaVerifySchema,
  mfaBackupVerifySchema,
} from "@auth-boilerplate/shared";
import { login, mfaLoginVerify, mfaLoginBackupVerify, getMe, logout } from "../../controllers/admin/adminAuth.controller";

const router = express.Router();

router.post(
  "/login",
  authLimiter,
  validateBody(loginAdminSchema),
  login
);

router.post(
  "/mfa/login-verify",
  authLimiter,
  validateBody(mfaVerifySchema),
  mfaLoginVerify
);

router.post(
  "/mfa/login-backup",
  authLimiter,
  validateBody(mfaBackupVerifySchema),
  mfaLoginBackupVerify
);

// Protected admin routes
router.get("/me", authoriseUser(["admin"]), getMe);
router.post("/logout", authoriseUser(["admin"]), logout);

export default router;
