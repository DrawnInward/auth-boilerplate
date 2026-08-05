import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import db from "../../database/db";
import { RequestWithUser } from "../../types";
import { sendSuccess } from "../../utils/responseUtils";
import { createCookieOptions } from "../../utils/createCookieOptions";
import { setAuthCookies, parseCookies } from "../../utils";
import { signOauthPending, verifyOauthPending } from "../../utils/oauthPending";
import {
  generateOAuthState,
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  isGoogleOAuthConfigured,
} from "../../utils/googleOAuth";
import {
  getUser,
  getUserByGoogleId,
  getUserWithPassword,
  getUserWithPasswordById,
  createGoogleUser,
  setGoogleId,
  setAuthProvider,
  unlinkGoogleAccount,
} from "../../models/users.models";
import { getMfaStatus } from "../../models/mfa.models";
import { services } from "../../services";
import { setMfaChallengeCookie } from "../../utils/mfaChallenge";
import { httpError } from "../../utils/httpError";
import { withTransaction } from "../../utils/withTransaction";

const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;
const OAUTH_PENDING_MAX_AGE = 10 * 60 * 1000;

export const initiateGoogleAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      throw httpError(503, "Google OAuth is not configured");
    }

    const state = generateOAuthState();
    const authUrl = getGoogleAuthUrl(state);

    const cookieOptions = createCookieOptions(OAUTH_STATE_MAX_AGE, {
      allowedOrigin: process.env.ALLOWED_ORIGIN,
    });
    res.cookie("oauth_state", state, cookieOptions);

    return sendSuccess(res, { url: authUrl }, "Redirect to Google");
  } catch (error) {
    next(error);
  }
};

export const handleGoogleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { code, state } = req.query;
    const cookies = parseCookies(req.headers.cookie);

    if (!code || typeof code !== "string") {
      throw httpError(400, "Authorization code missing");
    }

    if (!state || state !== cookies.oauth_state) {
      throw httpError(401, "Invalid OAuth state");
    }

    res.cookie(
      "oauth_state",
      "",
      createCookieOptions(0, {
        allowedOrigin: process.env.ALLOWED_ORIGIN,
      }),
    );

    const tokens = await exchangeCodeForTokens(code);
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    if (!googleUser.verified_email) {
      throw httpError(400, "Google email not verified");
    }

    // The callback has four outcomes. Only the database work belongs in the
    // transaction; which cookies to set and what to respond with is decided
    // afterwards, from the outcome it returns.
    const outcome = await withTransaction(db, async (client) => {
      const googleLinkedUser = await getUserByGoogleId(googleUser.id);

      if (googleLinkedUser) {
        const mfaStatus = await getMfaStatus(
          googleLinkedUser.user_id!,
          "user",
          client,
        );

        const start = await services.auth.startSession(
          {
            role_type: "user",
            role_id: googleLinkedUser.user_id!,
            is_active: googleLinkedUser.is_active === true,
            mfa_enabled: mfaStatus?.mfa_enabled === true,
            email_verified: googleLinkedUser.email_verified === true,
          },
          client,
        );

        if (start.kind === "mfa_required") {
          return {
            kind: "mfa_required" as const,
            challengeToken: start.challengeToken,
          };
        }

        return {
          kind: "logged_in" as const,
          user: googleLinkedUser,
          accessToken: start.accessToken,
          refreshToken: start.refreshToken,
        };
      }

      const existingUser = await getUser(googleUser.email);

      if (existingUser) {
        return { kind: "needs_linking" as const };
      }

      const createdUser = await createGoogleUser(
        googleUser.email,
        googleUser.id,
        client,
      );

      const tokens = await services.auth.issueSession(
        {
          role_type: "user",
          role_id: createdUser.user_id!,
          is_active: createdUser.is_active === true,
          email_verified: true,
        },
        client,
      );

      return {
        kind: "created" as const,
        user: createdUser,
        ...tokens,
      };
    });

    if (outcome.kind === "mfa_required") {
      setMfaChallengeCookie(res, outcome.challengeToken);

      return sendSuccess(
        res,
        { mfa_required: true },
        "MFA verification required",
      );
    }

    if (outcome.kind === "needs_linking") {
      const pendingData = signOauthPending(googleUser.id, googleUser.email);

      res.cookie(
        "oauth_pending",
        pendingData,
        createCookieOptions(OAUTH_PENDING_MAX_AGE, {
          allowedOrigin: process.env.ALLOWED_ORIGIN,
        }),
      );

      return sendSuccess(
        res,
        {
          needs_linking: true,
          email: googleUser.email,
        },
        "Account exists. Enter password to link Google.",
      );
    }

    setAuthCookies(res, outcome.accessToken, outcome.refreshToken);

    return sendSuccess(
      res,
      {
        user_id: outcome.user.user_id,
        email: outcome.user.email,
        is_active: outcome.user.is_active,
      },
      outcome.kind === "created"
        ? "Account created with Google"
        : "Logged in with Google",
    );
  } catch (error) {
    next(error);
  }
};

export const linkGoogleAccount = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { password } = req.body;
    const cookies = parseCookies(req.headers.cookie);
    const pendingData = cookies.oauth_pending;

    if (!pendingData) {
      throw httpError(400, "No pending Google link");
    }

    const { google_id, email } = verifyOauthPending(pendingData);

    const user = await getUserWithPassword(email);
    if (!user) {
      throw httpError(404, "User not found");
    }

    if (!user.password_hash) {
      throw httpError(400, "Cannot link to account without password");
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw httpError(401, "Invalid password");
    }

    // Cleared before the link is attempted, matching the original ordering:
    // a failure part-way through still consumes the pending cookie.
    res.cookie(
      "oauth_pending",
      "",
      createCookieOptions(0, {
        allowedOrigin: process.env.ALLOWED_ORIGIN,
      }),
    );

    const start = await withTransaction(db, async (client) => {
      await setGoogleId(user.user_id!, google_id, client);
      await setAuthProvider(user.user_id!, "both", client);

      const mfaStatus = await getMfaStatus(user.user_id!, "user", client);

      return services.auth.startSession(
        {
          role_type: "user",
          role_id: user.user_id!,
          is_active: user.is_active === true,
          mfa_enabled: mfaStatus?.mfa_enabled === true,
          email_verified: user.email_verified === true,
        },
        client,
      );
    });

    if (start.kind === "mfa_required") {
      setMfaChallengeCookie(res, start.challengeToken);

      return sendSuccess(
        res,
        { mfa_required: true },
        "MFA verification required",
      );
    }

    setAuthCookies(res, start.accessToken, start.refreshToken);

    return sendSuccess(
      res,
      { user_id: user.user_id },
      "Google account linked successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const unlinkGoogle = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role_id } = req.user!;

    const user = await getUserWithPasswordById(role_id);
    if (!user) {
      throw httpError(404, "User not found");
    }

    if (!user.password_hash) {
      throw httpError(400, "Cannot unlink Google without a password set");
    }

    await unlinkGoogleAccount(role_id);

    return sendSuccess(res, null, "Google account unlinked");
  } catch (error) {
    next(error);
  }
};
