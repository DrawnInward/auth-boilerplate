import { Request, Response } from "express";
import { isGoogleOAuthConfigured } from "../utils/googleOAuth";
import { getAccountCreationMode, getOrgCreationMode } from "../utils/config";
import { sendSuccess } from "../utils/responseUtils";

export const getConfig = (_req: Request, res: Response) => {
  const config = {
    oauth: {
      google: isGoogleOAuthConfigured(),
    },
    registration: {
      accountCreationMode: getAccountCreationMode(),
      orgCreationMode: getOrgCreationMode(),
    },
  };

  return sendSuccess(res, config);
};
