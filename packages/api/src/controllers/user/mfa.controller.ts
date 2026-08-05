import { Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import { sendSuccess } from "../../utils/responseUtils";
import { services } from "../../services";

export const setup = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;

    const { qrCodeDataUrl } = await services.userMfa.beginTotpSetup(role_id);

    return sendSuccess(res, { qr_code: qrCodeDataUrl }, "MFA setup initiated");
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

    const backupCodes = await services.userMfa.confirmTotpSetup(role_id, code);

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

    await services.userMfa.verifyTotp(role_id, code);

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

    await services.userMfa.disable(role_id, code, password);

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

    await services.userMfa.verifyBackupCode(role_id, code);

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

    const backupCodes = await services.userMfa.regenerateBackupCodes(
      role_id,
      code,
    );

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

    return sendSuccess(res, await services.userMfa.getStatus(role_id));
  } catch (error) {
    next(error);
  }
};
