import express from "express";
import { validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { authoriseUser } from "../../middleware/authoriseUser";
import {
  loginAdminSchema,
  completeRegistrationSchema,
  mfaVerifySchema,
  mfaBackupVerifySchema,
} from "@auth-boilerplate/shared";
import {
  login,
  completeRegistration,
  mfaLoginVerify,
  mfaLoginBackupVerify,
  getMe,
  logout,
} from "../../controllers/admin/adminAuth.controller";

const router = express.Router();

router.post("/login", authLimiter, validateBody(loginAdminSchema), login);

// Public: redeems an emailed admin_registration invitation token.
router.post(
  "/complete-registration",
  authLimiter,
  validateBody(completeRegistrationSchema),
  completeRegistration,
);

router.post(
  "/mfa/login-verify",
  authLimiter,
  validateBody(mfaVerifySchema),
  mfaLoginVerify,
);

router.post(
  "/mfa/login-backup",
  authLimiter,
  validateBody(mfaBackupVerifySchema),
  mfaLoginBackupVerify,
);

// Protected admin routes
router.get("/me", authoriseUser(["admin"]), getMe);
router.post("/logout", authoriseUser(["admin"]), logout);

export default router;
