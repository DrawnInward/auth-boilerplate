import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import { validateBody } from "../../middleware/validate";
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

router.post(
  "/disable",
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
