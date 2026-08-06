import { Request, Response, NextFunction } from "express";
import {
  getAdmin,
  getAdmins,
  getAdminById,
  deactivateAdmin,
} from "../../models/admins.models";
import { revokeUserTokens } from "../../models/refresh.models";
import {
  createInvitation,
  invalidatePendingInvitations,
} from "../../models/invitations.models";
import db from "../../database/db";
import { sendSuccess, sendCreated } from "../../utils/responseUtils";
import { getValidatedQuery } from "../../middleware/validate";
import type { AdminParams, AdminsQuery } from "@auth-boilerplate/shared";
import { RequestWithUser } from "../../types";
import { services } from "../../services";
import { httpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

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
    // The admins model matches email verbatim (its casing gap is a D6 item)
    // while createInvitation stores lowercase — normalise here or a mixed-case
    // duplicate slips past the 409 and fails only at redemption.
    const email = (req.body.email as string).toLowerCase();

    const existingAdmin = await getAdmin(email);
    if (existingAdmin) {
      throw httpError(409, "Email already exists");
    }

    // Invalidate + create atomically (the C3 inviteMember shape), so the
    // address can never be left with no live invitation — or, raced, with two.
    const { invitation, token } = await withTransaction(db, async (client) => {
      await invalidatePendingInvitations(email, "admin_registration", client);
      return createInvitation({ email, type: "admin_registration" }, client);
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

    const deactivated = await withTransaction(db, async (client) => {
      // The model refuses to deactivate the only active root admin, which is
      // the last-admin protection: root is the only caller of this route, so a
      // root self-lockout is structurally impossible.
      const updated = await deactivateAdmin(adminId, req.user!.role_id, client);
      // A deactivated admin keeps no working sessions. (S4)
      await revokeUserTokens(adminId, "admin", client);
      return updated;
    });

    return sendSuccess(res, deactivated, "Admin deactivated successfully");
  } catch (error) {
    next(error);
  }
};
