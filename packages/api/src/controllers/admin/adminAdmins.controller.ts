import { Request, Response, NextFunction } from "express";
import { getAdmin, getAdmins, getAdminById } from "../../models/admins.models";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { getValidatedQuery } from "../../middleware/validate";
import type { AdminParams, AdminsQuery } from "@auth-boilerplate/shared";
import { RequestWithUser } from "../../types";
import { services } from "../../services";
import { httpError } from "../../utils/httpError";

// GET /api/admin/admins
export const getAllAdmins = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { is_active, email_verified, root, limit, offset } =
      getValidatedQuery<AdminsQuery>(res);
    const filters = { is_active, email_verified, root };
    const pagination = { limit, offset };

    const admins = await getAdmins(filters, pagination);

    return sendSuccess(res, admins, "Admins retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/admins
export const createAdminHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const email = (req.body.email as string).toLowerCase();

    const existingAdmin = await getAdmin(email);
    if (existingAdmin) {
      throw httpError(409, "Email already exists");
    }

    const { invitation, token } = await services.invitation.mintInvitation({
      email,
      type: "admin_registration",
    });

    await services.email.sendAdminRegistrationInvite(email, token);

    return sendCreated(
      res,
      { email: invitation.email, expires_at: invitation.expires_at },
      "Invitation sent successfully",
    );
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/admins/:adminId/disable
export const disableAdminHandler = async (
  req: RequestWithUser<AdminParams>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { adminId } = req.params;

    const admin = await getAdminById(adminId);
    if (!admin) {
      throw httpError(404, "Admin not found");
    }
    if (!admin.is_active) {
      throw httpError(409, "Admin is already deactivated");
    }

    // A deactivated admin keeps no working sessions (S4) — the account
    // service owns that pairing. The model inside refuses to deactivate the
    // only active root admin (last-admin protection): root is the only
    // caller of this route, so a root self-lockout is structurally
    // impossible.
    const deactivated = await services.account.disableAdmin(
      adminId,
      req.user!.role_id,
    );

    return sendSuccess(res, deactivated, "Admin deactivated successfully");
  } catch (error) {
    next(error);
  }
};
