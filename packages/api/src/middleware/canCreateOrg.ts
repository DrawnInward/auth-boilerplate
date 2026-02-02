import { Response, NextFunction } from "express";
import { RequestWithUser } from "../types";
import { getUserById } from "../models/users.models";
import { getOrgCreationMode } from "../utils/config";

export const canCreateOrg = async (
  req: RequestWithUser,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role_type !== "user") {
      throw { status: 403, msg: "Only users can create organizations" };
    }

    const user = await getUserById(req.user.role_id);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    if (user.can_create_orgs === true) {
      return next();
    }

    if (user.can_create_orgs === false) {
      throw { status: 403, msg: "You are not allowed to create organizations" };
    }

    const mode = getOrgCreationMode();

    if (mode === "open") {
      return next();
    }

    if (mode === "admin_only") {
      throw { status: 403, msg: "Only administrators can create organizations" };
    }

    if (mode === "self_registered_only") {
      if (user.created_through === "self_registered") {
        return next();
      }
      throw { status: 403, msg: "Only self-registered users can create organizations" };
    }

    return next();
  } catch (error) {
    next(error);
  }
};
