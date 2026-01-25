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
  mfaVerifySchema,
  mfaBackupVerifySchema,
  setPasswordSchema,
} from "../../types";
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
} from "../../controllers/user/auth";

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

// Set password for OAuth users
router.post("/set-password", authoriseUser(["user"]), validateBody(setPasswordSchema), setPassword);

export default router;