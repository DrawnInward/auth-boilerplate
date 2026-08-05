import { Request, Response, NextFunction } from "express";
import { RequestWithUser } from "../../types";
import { sendSuccess } from "../../utils/responseUtils";
import { createCookieOptions } from "../../utils/createCookieOptions";
import { setAuthCookies, parseCookies } from "../../utils";
import { signOauthPending, verifyOauthPending } from "../../utils/oauthPending";
import { services } from "../../services";
import { setMfaChallengeCookie } from "../../utils/mfaChallenge";
import { httpError } from "../../utils/httpError";

const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;
const OAUTH_PENDING_MAX_AGE = 10 * 60 * 1000;

export const initiateGoogleAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { state, authUrl } = services.oauth.beginGoogleAuth();

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

    const outcome = await services.oauth.completeGoogleCallback(code);

    if (outcome.kind === "mfa_required") {
      setMfaChallengeCookie(res, outcome.challengeToken);

      return sendSuccess(
        res,
        { mfa_required: true },
        "MFA verification required",
      );
    }

    if (outcome.kind === "needs_linking") {
      const pendingData = signOauthPending(outcome.googleId, outcome.email);

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
          email: outcome.email,
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

    const { start, userId } = await services.oauth.linkGoogle(
      google_id,
      email,
      password,
      // Cleared before the link is attempted, matching the original ordering:
      // a failure part-way through still consumes the pending cookie.
      () =>
        res.cookie(
          "oauth_pending",
          "",
          createCookieOptions(0, {
            allowedOrigin: process.env.ALLOWED_ORIGIN,
          }),
        ),
    );

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
      { user_id: userId },
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

    await services.oauth.unlinkGoogle(role_id);

    return sendSuccess(res, null, "Google account unlinked");
  } catch (error) {
    next(error);
  }
};
