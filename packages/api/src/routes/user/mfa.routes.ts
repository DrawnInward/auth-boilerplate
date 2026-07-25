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
} from "../../controllers/user/mfa.controller";

const router = express.Router();

router.post("/setup", authoriseUser(["user"]), setup);

router.post(
  "/verify-setup",
  authoriseUser(["user"]),
  validateBody(mfaVerifySetupSchema),
  verifySetup,
);

router.post(
  "/verify",
  authoriseUser(["user"]),
  validateBody(mfaVerifySchema),
  verify,
);

router.post(
  "/disable",
  authoriseUser(["user"]),
  validateBody(mfaDisableSchema),
  disable,
);

router.post(
  "/backup/verify",
  authoriseUser(["user"]),
  validateBody(mfaBackupVerifySchema),
  verifyBackup,
);

router.post(
  "/backup/regenerate",
  authoriseUser(["user"]),
  validateBody(mfaVerifySchema),
  regenerateBackupCodes,
);

router.get("/status", authoriseUser(["user"]), getStatus);

export default router;
