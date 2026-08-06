import { Response, NextFunction } from "express";
import { getAdminById } from "../models/admins.models";
import { RequestWithUser } from "../types";
import { httpError } from "../utils/httpError";

// Gates an admin route to the root admin. Runs after authoriseUser(["admin"])
// and re-reads the admins row rather than trusting the access token's `root`
// claim: refresh rotation currently mints tokens without that claim (D6), so a
// claims-based check would silently drop root after the first refresh.
export const requireRootAdmin = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = await getAdminById(req.user!.role_id);

    // The is_active check is defence in depth: the single-root invariant means
    // no API path can produce an inactive root today, but this middleware
    // should not depend on that holding forever.
    if (!admin || !admin.is_active || !admin.root) {
      throw httpError(403, "Root admin required");
    }

    next();
  } catch (error) {
    next(error);
  }
};
