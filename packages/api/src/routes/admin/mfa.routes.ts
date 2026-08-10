import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import { validateBody } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import {
  mfaVerifySetupSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  mfaBackupVerifySchema,
} from "@auth-boilerplate/shared";
import {
  setup,
  verifySetup,
  verify,
  disable,
  verifyBackup,
  regenerateBackupCodes,
  getStatus,
} from "../../controllers/admin/mfa.controller";

const router = express.Router();

router.post("/setup", authoriseUser(["admin"]), setup);

router.post(
  "/verify-setup",
  authoriseUser(["admin"]),
  validateBody(mfaVerifySetupSchema),
  verifySetup,
);

router.post(
  "/verify",
  authoriseUser(["admin"]),
  validateBody(mfaVerifySchema),
  verify,
);

// authLimiter: disable accepts the account password (A5/S8), so it needs
// the same brute-force budget as login — without it, a stolen session is a
// password-guessing oracle at the global limiter's rate.
router.post(
  "/disable",
  authLimiter,
  authoriseUser(["admin"]),
  validateBody(mfaDisableSchema),
  disable,
);

router.post(
  "/backup/verify",
  authoriseUser(["admin"]),
  validateBody(mfaBackupVerifySchema),
  verifyBackup,
);

router.post(
  "/backup/regenerate",
  authoriseUser(["admin"]),
  validateBody(mfaVerifySchema),
  regenerateBackupCodes,
);

router.get("/status", authoriseUser(["admin"]), getStatus);

export default router;
