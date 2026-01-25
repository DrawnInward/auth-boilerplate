import express from "express";
import { validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { loginAdminSchema, mfaVerifySchema, mfaBackupVerifySchema } from "../../types";
import { login, mfaLoginVerify, mfaLoginBackupVerify } from "../../controllers/admin/adminAuth";

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

export default router;