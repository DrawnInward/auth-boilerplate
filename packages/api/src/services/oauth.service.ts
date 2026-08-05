import bcrypt from "bcrypt";
import { PoolClient } from "pg";
import { GoogleOAuthProvider } from "../interfaces/googleOAuth";
import type * as userModels from "../models/users.models";
import type * as mfaModels from "../models/mfa.models";
import { User } from "../types";
import { httpError } from "../utils/httpError";
import { AuthService, SessionStart } from "./auth.service";

export type OauthServiceDeps = {
  google: GoogleOAuthProvider;
  users: Pick<
    typeof userModels,
    | "getUser"
    | "getUserByGoogleId"
    | "getUserWithPassword"
    | "getUserWithPasswordById"
    | "createGoogleUser"
    | "setGoogleId"
    | "setAuthProvider"
    | "unlinkGoogleAccount"
  >;
  getMfaStatus: (typeof mfaModels)["getMfaStatus"];
  startSession: AuthService["startSession"];
  issueSession: AuthService["issueSession"];
  runTransaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
};

export type GoogleCallbackOutcome =
  | { kind: "mfa_required"; challengeToken: string }
  | { kind: "needs_linking"; googleId: string; email: string }
  | {
      kind: "logged_in" | "created";
      user: Omit<User, "password_hash">;
      accessToken: string;
      refreshToken: string;
    };

export type OauthService = {
  beginGoogleAuth(): { state: string; authUrl: string };
  completeGoogleCallback(code: string): Promise<GoogleCallbackOutcome>;
  /**
   * `onPasswordVerified` fires once the credentials are proven, before any
   * write — the caller uses it to consume the pending-link cookie, so a
   * failure part-way through the link still clears it.
   */
  linkGoogle(
    googleId: string,
    email: string,
    password: string,
    onPasswordVerified?: () => void,
  ): Promise<{ start: SessionStart; userId: string }>;
  unlinkGoogle(roleId: string): Promise<void>;
};

export const createOauthService = ({
  google,
  users,
  getMfaStatus,
  startSession,
  issueSession,
  runTransaction,
}: OauthServiceDeps): OauthService => {
  const beginGoogleAuth = () => {
    if (!google.isConfigured()) {
      throw httpError(503, "Google OAuth is not configured");
    }

    const state = google.generateState();
    return { state, authUrl: google.getAuthUrl(state) };
  };

  const completeGoogleCallback = async (
    code: string,
  ): Promise<GoogleCallbackOutcome> => {
    const tokens = await google.exchangeCodeForTokens(code);
    const googleUser = await google.getUserInfo(tokens.access_token);

    if (!googleUser.verified_email) {
      throw httpError(400, "Google email not verified");
    }

    // The callback has four outcomes. Only the database work belongs in the
    // transaction; which cookies to set and what to respond with is the
    // controller's decision, made from the outcome this returns.
    return runTransaction(async (client) => {
      const googleLinkedUser = await users.getUserByGoogleId(googleUser.id);

      if (googleLinkedUser) {
        const mfaStatus = await getMfaStatus(
          googleLinkedUser.user_id!,
          "user",
          client,
        );

        const start = await startSession(
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

      const existingUser = await users.getUser(googleUser.email);

      if (existingUser) {
        return {
          kind: "needs_linking" as const,
          googleId: googleUser.id,
          email: googleUser.email,
        };
      }

      const createdUser = await users.createGoogleUser(
        googleUser.email,
        googleUser.id,
        client,
      );

      const sessionTokens = await issueSession(
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
        ...sessionTokens,
      };
    });
  };

  const linkGoogle = async (
    googleId: string,
    email: string,
    password: string,
    onPasswordVerified?: () => void,
  ): Promise<{ start: SessionStart; userId: string }> => {
    const user = await users.getUserWithPassword(email);
    if (!user) {
      throw httpError(404, "User not found");
    }

    if (!user.password_hash) {
      throw httpError(400, "Cannot link to account without password");
    }

    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw httpError(401, "Invalid password");
    }

    onPasswordVerified?.();

    const start = await runTransaction(async (client) => {
      await users.setGoogleId(user.user_id!, googleId, client);
      await users.setAuthProvider(user.user_id!, "both", client);

      const mfaStatus = await getMfaStatus(user.user_id!, "user", client);

      return startSession(
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

    return { start, userId: user.user_id! };
  };

  const unlinkGoogle = async (roleId: string): Promise<void> => {
    const user = await users.getUserWithPasswordById(roleId);
    if (!user) {
      throw httpError(404, "User not found");
    }

    if (!user.password_hash) {
      throw httpError(400, "Cannot unlink Google without a password set");
    }

    await users.unlinkGoogleAccount(roleId);
  };

  return { beginGoogleAuth, completeGoogleCallback, linkGoogle, unlinkGoogle };
};
