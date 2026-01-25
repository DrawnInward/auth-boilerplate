import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import db from "../../database/db";
import { RequestWithUser } from "../../types";
import { sendSuccess } from "../../utils/responseUtils";
import { createCookieOptions } from "../../utils/createCookieOptions";
import { setAuthCookies, parseCookies } from "../../utils";
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
import { addRefresh } from "../../models/refresh.models";
import { getMfaStatus } from "../../models/mfa.models";
import {
  createMfaChallengeToken,
  setMfaChallengeCookie,
} from "../../utils/mfaChallenge";

const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;
const OAUTH_PENDING_MAX_AGE = 10 * 60 * 1000;

export const initiateGoogleAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      throw { status: 503, msg: "Google OAuth is not configured" };
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
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { code, state } = req.query;
    const cookies = parseCookies(req.headers.cookie);

    if (!code || typeof code !== "string") {
      throw { status: 400, msg: "Authorization code missing" };
    }

    if (!state || state !== cookies.oauth_state) {
      throw { status: 401, msg: "Invalid OAuth state" };
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
      throw { status: 400, msg: "Google email not verified" };
    }

    let user = await getUserByGoogleId(googleUser.id);

    if (user) {
      const mfaStatus = await getMfaStatus(user.user_id!, "user", client);

      if (mfaStatus?.mfa_enabled) {
        const challengeToken = createMfaChallengeToken(user.user_id!, "user");
        setMfaChallengeCookie(res, challengeToken);

        await client.query("COMMIT");
        return sendSuccess(
          res,
          { mfa_required: true },
          "MFA verification required",
        );
      }

      const accessKey = process.env.USER_ACCESS_KEY;
      if (!accessKey) {
        throw { status: 500, msg: "Server configuration error" };
      }

      const accessToken = jwt.sign(
        {
          role_id: user.user_id,
          role_type: "user",
          email_verified: user.email_verified,
        },
        accessKey,
        { expiresIn: "15m" },
      );

      const { token: refreshToken } = await addRefresh(
        { role_id: user.user_id!, role_type: "user" },
        client,
      );

      await client.query("COMMIT");

      setAuthCookies(res, accessToken, refreshToken);

      return sendSuccess(
        res,
        {
          user_id: user.user_id,
          email: user.email,
          is_active: user.is_active,
        },
        "Logged in with Google",
      );
    }

    const existingUser = await getUser(googleUser.email);

    if (existingUser) {
      const pendingData = Buffer.from(
        JSON.stringify({ google_id: googleUser.id, email: googleUser.email }),
      ).toString("base64");

      res.cookie(
        "oauth_pending",
        pendingData,
        createCookieOptions(OAUTH_PENDING_MAX_AGE, {
          allowedOrigin: process.env.ALLOWED_ORIGIN,
        }),
      );

      await client.query("COMMIT");

      return sendSuccess(
        res,
        {
          needs_linking: true,
          email: googleUser.email,
        },
        "Account exists. Enter password to link Google.",
      );
    }

    user = await createGoogleUser(googleUser.email, googleUser.id, client);

    const accessKey = process.env.USER_ACCESS_KEY;
    if (!accessKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: user.user_id,
        role_type: "user",
        email_verified: true,
      },
      accessKey,
      { expiresIn: "15m" },
    );

    const { token: refreshToken } = await addRefresh(
      { role_id: user.user_id!, role_type: "user" },
      client,
    );

    await client.query("COMMIT");

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(
      res,
      {
        user_id: user.user_id,
        email: user.email,
        is_active: user.is_active,
      },
      "Account created with Google",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const linkGoogleAccount = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { password } = req.body;
    const cookies = parseCookies(req.headers.cookie);
    const pendingData = cookies.oauth_pending;

    if (!pendingData) {
      throw { status: 400, msg: "No pending Google link" };
    }

    const { google_id, email } = JSON.parse(
      Buffer.from(pendingData, "base64").toString("utf8")
    );

    const user = await getUserWithPassword(email);
    if (!user) {
      throw { status: 404, msg: "User not found" };
    }

    if (!user.password_hash) {
      throw { status: 400, msg: "Cannot link to account without password" };
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw { status: 401, msg: "Invalid password" };
    }

    await setGoogleId(user.user_id!, google_id, client);
    await setAuthProvider(user.user_id!, "both", client);

    res.cookie(
      "oauth_pending",
      "",
      createCookieOptions(0, {
        allowedOrigin: process.env.ALLOWED_ORIGIN,
      }),
    );

    const mfaStatus = await getMfaStatus(user.user_id!, "user", client);

    if (mfaStatus?.mfa_enabled) {
      const challengeToken = createMfaChallengeToken(user.user_id!, "user");
      setMfaChallengeCookie(res, challengeToken);

      await client.query("COMMIT");
      return sendSuccess(
        res,
        { mfa_required: true },
        "MFA verification required",
      );
    }

    const accessKey = process.env.USER_ACCESS_KEY;
    if (!accessKey) {
      throw { status: 500, msg: "Server configuration error" };
    }

    const accessToken = jwt.sign(
      {
        role_id: user.user_id,
        role_type: "user",
        email_verified: user.email_verified,
      },
      accessKey,
      { expiresIn: "15m" },
    );

    const { token: refreshToken } = await addRefresh(
      { role_id: user.user_id!, role_type: "user" },
      client,
    );

    await client.query("COMMIT");

    setAuthCookies(res, accessToken, refreshToken);

    return sendSuccess(
      res,
      { user_id: user.user_id },
      "Google account linked successfully",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
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
      throw { status: 404, msg: "User not found" };
    }

    if (!user.password_hash) {
      throw { status: 400, msg: "Cannot unlink Google without a password set" };
    }

    await unlinkGoogleAccount(role_id);

    return sendSuccess(res, null, "Google account unlinked");
  } catch (error) {
    next(error);
  }
};
