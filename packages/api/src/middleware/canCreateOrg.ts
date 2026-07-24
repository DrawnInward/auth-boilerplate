import { Response, NextFunction } from "express";
import { RequestWithUser } from "../types";
import { getUserById } from "../models/users.models";
import { getOrgCreationMode } from "../utils/config";
import { httpError } from "../utils/httpError";

export const canCreateOrg = async (
  req: RequestWithUser,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role_type !== "user") {
      throw httpError(403, "Only users can create organizations");
    }

    const user = await getUserById(req.user.role_id);
    if (!user) {
      throw httpError(404, "User not found");
    }

    if (user.can_create_orgs === true) {
      return next();
    }

    if (user.can_create_orgs === false) {
      throw httpError(403, "You are not allowed to create organizations");
    }

    const mode = getOrgCreationMode();

    if (mode === "open") {
      return next();
    }

    if (mode === "admin_only") {
      throw httpError(403, "Only administrators can create organizations");
    }

    if (mode === "self_registered_only") {
      if (user.created_through === "self_registered") {
        return next();
      }
      throw httpError(403, "Only self-registered users can create organizations");
    }

    return next();
  } catch (error) {
    next(error);
  }
};
