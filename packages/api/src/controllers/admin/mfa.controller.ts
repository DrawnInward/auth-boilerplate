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
import { getAdminById } from "../../models/admins.models";
import { sendMfaEnabledEmail, sendMfaDisabledEmail } from "../../utils/email";

export const setup = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const { role_id } = req.user!;

    const admin = await getAdminById(role_id);
    if (!admin) {
      throw { status: 404, msg: "Admin not found" };
    }

    const mfaStatus = await getMfaStatus(role_id, "admin");
    if (mfaStatus?.mfa_enabled) {
      throw { status: 400, msg: "MFA is already enabled" };
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
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { role_id } = req.user!;
    const { code } = req.body;

    const admin = await getAdminById(role_id);
    if (!admin) {
      throw { status: 404, msg: "Admin not found" };
    }

    const mfaStatus = await getMfaStatus(role_id, "admin", client);
    if (mfaStatus?.mfa_enabled) {
      throw { status: 400, msg: "MFA is already enabled" };
    }

    const secret = await getMfaSecret(role_id, "admin", client);
    if (!secret) {
      throw { status: 400, msg: "MFA setup not initiated" };
    }

    if (!verifyTotpCode(secret, code)) {
      throw { status: 401, msg: "Invalid verification code" };
    }

    await enableMfa(role_id, "admin", client);

    await deleteAllBackupCodes(role_id, "admin", client);
    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);
    await createBackupCodes(role_id, "admin", hashedCodes, client);

    await client.query("COMMIT");

    await sendMfaEnabledEmail(admin.email!);

    return sendSuccess(
      res,
      { backupCodes },
      "MFA enabled successfully. Save your backup codes securely."
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const verify = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const { role_id } = req.user!;
    const { code } = req.body;

    const secret = await getMfaSecret(role_id, "admin");
    if (!secret) {
      throw { status: 400, msg: "MFA not enabled" };
    }

    if (!verifyTotpCode(secret, code)) {
      throw { status: 401, msg: "Invalid verification code" };
    }

    return sendSuccess(res, null, "MFA verification successful");
  } catch (error) {
    next(error);
  }
};

export const disable = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { role_id } = req.user!;
    const { code } = req.body;

    const admin = await getAdminById(role_id);
    if (!admin) {
      throw { status: 404, msg: "Admin not found" };
    }

    const mfaStatus = await getMfaStatus(role_id, "admin", client);
    if (!mfaStatus?.mfa_enabled) {
      throw { status: 400, msg: "MFA is not enabled" };
    }

    const secret = await getMfaSecret(role_id, "admin", client);
    let verified = false;

    if (secret && verifyTotpCode(secret, code)) {
      verified = true;
    }

    if (!verified) {
      const unusedCodes = await getUnusedBackupCodes(role_id, "admin", client);
      for (const backupCode of unusedCodes) {
        if (await bcrypt.compare(code, backupCode.code_hash)) {
          verified = true;
          await markBackupCodeUsed(backupCode.id, client);
          break;
        }
      }
    }

    if (!verified) {
      throw { status: 401, msg: "Invalid code" };
    }

    await disableMfa(role_id, "admin", client);
    await deleteAllBackupCodes(role_id, "admin", client);

    await client.query("COMMIT");

    await sendMfaDisabledEmail(admin.email!);

    return sendSuccess(res, null, "MFA disabled successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const verifyBackup = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { role_id } = req.user!;
    const { code } = req.body;

    const mfaStatus = await getMfaStatus(role_id, "admin", client);
    if (!mfaStatus?.mfa_enabled) {
      throw { status: 400, msg: "MFA is not enabled" };
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
      throw { status: 401, msg: "Invalid backup code" };
    }

    await markBackupCodeUsed(matchedCode.id, client);

    await client.query("COMMIT");

    return sendSuccess(res, null, "Backup code verified successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const regenerateBackupCodes = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { role_id } = req.user!;
    const { code } = req.body;

    const mfaStatus = await getMfaStatus(role_id, "admin", client);
    if (!mfaStatus?.mfa_enabled) {
      throw { status: 400, msg: "MFA is not enabled" };
    }

    const secret = await getMfaSecret(role_id, "admin", client);
    if (!secret || !verifyTotpCode(secret, code)) {
      throw { status: 401, msg: "Invalid verification code" };
    }

    await deleteAllBackupCodes(role_id, "admin", client);
    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);
    await createBackupCodes(role_id, "admin", hashedCodes, client);

    await client.query("COMMIT");

    return sendSuccess(
      res,
      { backupCodes },
      "Backup codes regenerated successfully"
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const getStatus = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
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
