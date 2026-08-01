import { Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import db from "../../database/db";
import { RequestWithUser } from "../../types";
import { sendSuccess } from "../../utils/responseUtils";
import { generateTotpSecret, verifyTotpCode } from "../../utils/totp";
import { generateBackupCodes, hashBackupCodes } from "../../utils/backupCodes";
import {
  getMfaStatus,
  getMfaSecret,
  setMfaSecret,
  enableMfa,
  disableMfa,
  createBackupCodes,
  getUnusedBackupCodes,
  getBackupCodeCount,
  markBackupCodeUsed,
  deleteAllBackupCodes,
} from "../../models/mfa.models";
import {
  getAdminById,
  getAdminWithPasswordById,
} from "../../models/admins.models";
import { services } from "../../services";
import { httpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

export const setup = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;

    const admin = await getAdminById(role_id);
    if (!admin) {
      throw httpError(404, "Admin not found");
    }

    const mfaStatus = await getMfaStatus(role_id, "admin");
    if (mfaStatus?.mfa_enabled) {
      throw httpError(400, "MFA is already enabled");
    }

    const { secret, qrCodeDataUrl } = await generateTotpSecret(admin.email!);

    await setMfaSecret(role_id, "admin", secret);

    return sendSuccess(res, { qrCode: qrCodeDataUrl }, "MFA setup initiated");
  } catch (error) {
    next(error);
  }
};

export const verifySetup = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;
    const { code } = req.body;

    const admin = await getAdminById(role_id);
    if (!admin) {
      throw httpError(404, "Admin not found");
    }

    const backupCodes = await withTransaction(db, async (client) => {
      const mfaStatus = await getMfaStatus(role_id, "admin", client);
      if (mfaStatus?.mfa_enabled) {
        throw httpError(400, "MFA is already enabled");
      }

      const secret = await getMfaSecret(role_id, "admin", client);
      if (!secret) {
        throw httpError(400, "MFA setup not initiated");
      }

      if (!verifyTotpCode(secret, code)) {
        throw httpError(401, "Invalid verification code");
      }

      await enableMfa(role_id, "admin", client);

      await deleteAllBackupCodes(role_id, "admin", client);
      const codes = generateBackupCodes();
      const hashedCodes = await hashBackupCodes(codes);
      await createBackupCodes(role_id, "admin", hashedCodes, client);

      return codes;
    });

    await services.email.sendMfaEnabled(admin.email!);

    return sendSuccess(
      res,
      { backup_codes: backupCodes },
      "MFA enabled successfully. Save your backup codes securely.",
    );
  } catch (error) {
    next(error);
  }
};

export const verify = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;
    const { code } = req.body;

    const secret = await getMfaSecret(role_id, "admin");
    if (!secret) {
      throw httpError(400, "MFA not enabled");
    }

    if (!verifyTotpCode(secret, code)) {
      throw httpError(401, "Invalid verification code");
    }

    return sendSuccess(res, null, "MFA verification successful");
  } catch (error) {
    next(error);
  }
};

export const disable = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;
    const { code, password } = req.body;

    const admin = await getAdminWithPasswordById(role_id);
    if (!admin) {
      throw httpError(404, "Admin not found");
    }

    // S8: disabling a second factor is a step-up operation — the account
    // password is required alongside a current code, so a stolen session
    // plus one leaked backup code cannot silently remove MFA.
    if (!(await bcrypt.compare(password, admin.password_hash))) {
      throw httpError(401, "Invalid password");
    }

    await withTransaction(db, async (client) => {
      const mfaStatus = await getMfaStatus(role_id, "admin", client);
      if (!mfaStatus?.mfa_enabled) {
        throw httpError(400, "MFA is not enabled");
      }

      const secret = await getMfaSecret(role_id, "admin", client);
      let verified = false;

      if (secret && verifyTotpCode(secret, code)) {
        verified = true;
      }

      if (!verified) {
        const unusedCodes = await getUnusedBackupCodes(
          role_id,
          "admin",
          client,
        );
        for (const backupCode of unusedCodes) {
          if (await bcrypt.compare(code, backupCode.code_hash)) {
            verified = true;
            await markBackupCodeUsed(backupCode.id, client);
            break;
          }
        }
      }

      if (!verified) {
        throw httpError(401, "Invalid code");
      }

      await disableMfa(role_id, "admin", client);
      await deleteAllBackupCodes(role_id, "admin", client);
    });

    await services.email.sendMfaDisabled(admin.email!);

    return sendSuccess(res, null, "MFA disabled successfully");
  } catch (error) {
    next(error);
  }
};

export const verifyBackup = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;
    const { code } = req.body;

    await withTransaction(db, async (client) => {
      const mfaStatus = await getMfaStatus(role_id, "admin", client);
      if (!mfaStatus?.mfa_enabled) {
        throw httpError(400, "MFA is not enabled");
      }

      const unusedCodes = await getUnusedBackupCodes(role_id, "admin", client);
      let matchedCode = null;

      for (const backupCode of unusedCodes) {
        if (await bcrypt.compare(code, backupCode.code_hash)) {
          matchedCode = backupCode;
          break;
        }
      }

      if (!matchedCode) {
        throw httpError(401, "Invalid backup code");
      }

      await markBackupCodeUsed(matchedCode.id, client);
    });

    return sendSuccess(res, null, "Backup code verified successfully");
  } catch (error) {
    next(error);
  }
};

export const regenerateBackupCodes = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;
    const { code } = req.body;

    const backupCodes = await withTransaction(db, async (client) => {
      const mfaStatus = await getMfaStatus(role_id, "admin", client);
      if (!mfaStatus?.mfa_enabled) {
        throw httpError(400, "MFA is not enabled");
      }

      const secret = await getMfaSecret(role_id, "admin", client);
      if (!secret || !verifyTotpCode(secret, code)) {
        throw httpError(401, "Invalid verification code");
      }

      await deleteAllBackupCodes(role_id, "admin", client);
      const codes = generateBackupCodes();
      const hashedCodes = await hashBackupCodes(codes);
      await createBackupCodes(role_id, "admin", hashedCodes, client);

      return codes;
    });

    return sendSuccess(
      res,
      { backup_codes: backupCodes },
      "Backup codes regenerated successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const getStatus = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;

    const mfaStatus = await getMfaStatus(role_id, "admin");
    const backupCodeCount = mfaStatus?.mfa_enabled
      ? await getBackupCodeCount(role_id, "admin")
      : 0;

    return sendSuccess(res, {
      mfa_enabled: mfaStatus?.mfa_enabled || false,
      backup_codes_remaining: backupCodeCount,
    });
  } catch (error) {
    next(error);
  }
};
