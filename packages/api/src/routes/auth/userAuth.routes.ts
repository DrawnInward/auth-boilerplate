import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import { validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import {
  loginUserSchema,
  registerSchema,
  completeRegistrationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  requestEmailChangeSchema,
} from "../../types";
import {
  mfaVerifySchema,
  mfaBackupVerifySchema,
  setPasswordSchema,
} from "@auth-boilerplate/shared";
import {
  login,
  logout,
  register,
  verifyToken,
  completeRegistration,
  forgotPassword,
  resetPassword,
  mfaLoginVerify,
  mfaLoginBackupVerify,
  setPassword,
  getMe,
  changePassword,
  updateProfile,
  requestEmailChange,
  confirmEmailChange,
} from "../../controllers/user/auth.controller";

const router = express.Router();

// Public auth routes (rate limited to prevent abuse)
router.post("/register", authLimiter, validateBody(registerSchema), register);
router.get("/verify/:token", authLimiter, verifyToken);
router.post(
  "/complete-registration",
  authLimiter,
  validateBody(completeRegistrationSchema),
  completeRegistration
);
router.post("/forgot-password", authLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), resetPassword);

// Standard auth routes
router.post("/login", authLimiter, validateBody(loginUserSchema), login);
router.post("/logout", authoriseUser(["user"]), logout);

// MFA login verification routes
router.post("/mfa/login-verify", authLimiter, validateBody(mfaVerifySchema), mfaLoginVerify);
router.post("/mfa/login-backup", authLimiter, validateBody(mfaBackupVerifySchema), mfaLoginBackupVerify);

// Protected user routes
router.get("/me", authoriseUser(["user"]), getMe);
router.put("/change-password", authoriseUser(["user"]), validateBody(changePasswordSchema), changePassword);
router.put("/profile", authoriseUser(["user"]), validateBody(updateProfileSchema), updateProfile);
router.post("/request-email-change", authoriseUser(["user"]), validateBody(requestEmailChangeSchema), requestEmailChange);

// Email change confirmation (public route with token)
router.post("/confirm-email-change/:token", authLimiter, confirmEmailChange);

// Set password for OAuth users
router.post("/set-password", authoriseUser(["user"]), validateBody(setPasswordSchema), setPassword);

export default router;
