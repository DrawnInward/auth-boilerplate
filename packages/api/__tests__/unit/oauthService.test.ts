import bcrypt from "bcrypt";
import { PoolClient } from "pg";
import {
  createOauthService,
  OauthService,
  SessionStart,
} from "../../src/services";
import {
  GoogleOAuthProvider,
  GoogleUserInfo,
} from "../../src/interfaces/googleOAuth";
import { User } from "../../src/types";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const GOOGLE_ID = "google-id-123";

describe("oauthService", () => {
  let googleUser: GoogleUserInfo;
  let configured: boolean;
  let exchangedCodes: string[];
  let userInfoTokens: string[];
  let usersByEmail: Map<string, User>;
  let usersByGoogleId: Map<string, User>;
  let createdGoogleUsers: {
    email: string;
    googleId: string;
    client: unknown;
  }[];
  let linkedGoogleIds: { userId: string; googleId: string; client: unknown }[];
  let providerChanges: { userId: string; provider: string; client: unknown }[];
  let unlinkedUserIds: string[];
  let mfaEnabled: boolean;
  let startSessionCalls: {
    principal: Record<string, unknown>;
    client: unknown;
  }[];
  let issueSessionCalls: {
    principal: Record<string, unknown>;
    client: unknown;
  }[];
  let oauth: OauthService;

  const txClient = { transaction: true } as unknown as PoolClient;

  // The deterministic fake the adapter seam exists for: no network, no
  // jest.mock — tests configure what "Google" returns and inspect what was
  // asked of it.
  const fakeGoogle: GoogleOAuthProvider = {
    isConfigured: () => configured,
    generateState: () => "fake-state",
    getAuthUrl: (state) => `https://google.example/auth?state=${state}`,
    exchangeCodeForTokens: async (code) => {
      exchangedCodes.push(code);
      return {
        access_token: `access-for-${code}`,
        id_token: "id-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
      };
    },
    getUserInfo: async (accessToken) => {
      userInfoTokens.push(accessToken);
      return googleUser;
    },
  };

  beforeEach(() => {
    configured = true;
    googleUser = {
      id: GOOGLE_ID,
      email: "person@example.com",
      verified_email: true,
    };
    exchangedCodes = [];
    userInfoTokens = [];
    usersByEmail = new Map();
    usersByGoogleId = new Map();
    createdGoogleUsers = [];
    linkedGoogleIds = [];
    providerChanges = [];
    unlinkedUserIds = [];
    mfaEnabled = false;
    startSessionCalls = [];
    issueSessionCalls = [];

    oauth = createOauthService({
      google: fakeGoogle,
      users: {
        getUser: async (email) => usersByEmail.get(email) ?? null,
        getUserByGoogleId: async (googleId) =>
          usersByGoogleId.get(googleId) ?? null,
        getUserWithPassword: async (email) => usersByEmail.get(email) ?? null,
        getUserWithPasswordById: async () =>
          [...usersByEmail.values()].find((u) => u.user_id === USER_ID) ?? null,
        createGoogleUser: async (email, googleId, client) => {
          createdGoogleUsers.push({ email, googleId, client });
          return {
            user_id: USER_ID,
            email,
            google_id: googleId,
            is_active: true,
            email_verified: true,
          };
        },
        setGoogleId: async (userId, googleId, client) => {
          linkedGoogleIds.push({ userId, googleId, client });
          return { user_id: userId, email: "person@example.com" };
        },
        setAuthProvider: async (userId, provider, client) => {
          providerChanges.push({ userId, provider, client });
          return { user_id: userId, email: "person@example.com" };
        },
        unlinkGoogleAccount: async (userId) => {
          unlinkedUserIds.push(userId);
          return { user_id: userId, email: "person@example.com" };
        },
      },
      getMfaStatus: async () => ({
        mfa_enabled: mfaEnabled,
        mfa_secret: null,
      }),
      startSession: async (principal, client): Promise<SessionStart> => {
        startSessionCalls.push({ principal, client });
        return principal.mfa_enabled
          ? { kind: "mfa_required", challengeToken: "challenge" }
          : { kind: "session", accessToken: "access", refreshToken: "refresh" };
      },
      issueSession: async (principal, client) => {
        issueSessionCalls.push({ principal, client });
        return { accessToken: "access", refreshToken: "refresh" };
      },
      runTransaction: (fn) => fn(txClient),
    });
  });

  const seedUser = async (overrides: Partial<User> = {}): Promise<User> => {
    const user: User = {
      user_id: USER_ID,
      email: "person@example.com",
      password_hash: await bcrypt.hash("Password1", 4),
      is_active: true,
      email_verified: true,
      ...overrides,
    };
    usersByEmail.set(user.email, user);
    return user;
  };

  describe("beginGoogleAuth", () => {
    it("refuses when the provider is not configured", () => {
      configured = false;
      expect(() => oauth.beginGoogleAuth()).toThrow(
        expect.objectContaining({ status: 503 }),
      );
    });

    it("returns the provider's auth URL built from a fresh state", () => {
      expect(oauth.beginGoogleAuth()).toEqual({
        state: "fake-state",
        authUrl: "https://google.example/auth?state=fake-state",
      });
    });
  });

  describe("completeGoogleCallback", () => {
    it("fetches user info with the exchanged access token", async () => {
      await oauth.completeGoogleCallback("the-code");
      expect(exchangedCodes).toEqual(["the-code"]);
      expect(userInfoTokens).toEqual(["access-for-the-code"]);
    });

    it("refuses an unverified Google email before touching the database", async () => {
      googleUser.verified_email = false;
      await expect(
        oauth.completeGoogleCallback("the-code"),
      ).rejects.toMatchObject({
        status: 400,
        message: "Google email not verified",
      });
      expect(createdGoogleUsers).toEqual([]);
      expect(startSessionCalls).toEqual([]);
    });

    it("logs in an already-linked account", async () => {
      const user = await seedUser({ google_id: GOOGLE_ID });
      usersByGoogleId.set(GOOGLE_ID, user);

      const outcome = await oauth.completeGoogleCallback("the-code");

      expect(outcome).toMatchObject({
        kind: "logged_in",
        accessToken: "access",
        refreshToken: "refresh",
      });
      expect(startSessionCalls[0]).toEqual({
        principal: {
          role_type: "user",
          role_id: USER_ID,
          is_active: true,
          mfa_enabled: false,
          email_verified: true,
        },
        client: txClient,
      });
    });

    it("returns mfa_required for a linked MFA account", async () => {
      const user = await seedUser({ google_id: GOOGLE_ID });
      usersByGoogleId.set(GOOGLE_ID, user);
      mfaEnabled = true;

      const outcome = await oauth.completeGoogleCallback("the-code");

      expect(outcome).toEqual({
        kind: "mfa_required",
        challengeToken: "challenge",
      });
    });

    it("asks for linking when the email exists without a Google id", async () => {
      await seedUser();

      const outcome = await oauth.completeGoogleCallback("the-code");

      expect(outcome).toEqual({
        kind: "needs_linking",
        googleId: GOOGLE_ID,
        email: "person@example.com",
      });
      expect(createdGoogleUsers).toEqual([]);
      expect(startSessionCalls).toEqual([]);
    });

    it("creates an account for an unknown email and issues a session", async () => {
      const outcome = await oauth.completeGoogleCallback("the-code");

      expect(outcome).toMatchObject({ kind: "created" });
      expect(createdGoogleUsers).toEqual([
        { email: "person@example.com", googleId: GOOGLE_ID, client: txClient },
      ]);
      expect(issueSessionCalls[0]).toEqual({
        principal: {
          role_type: "user",
          role_id: USER_ID,
          is_active: true,
          email_verified: true,
        },
        client: txClient,
      });
    });
  });

  describe("linkGoogle", () => {
    it("refuses an unknown account", async () => {
      await expect(
        oauth.linkGoogle(GOOGLE_ID, "person@example.com", "Password1"),
      ).rejects.toMatchObject({ status: 404, message: "User not found" });
    });

    it("refuses a passwordless account", async () => {
      await seedUser({ password_hash: null });
      await expect(
        oauth.linkGoogle(GOOGLE_ID, "person@example.com", "Password1"),
      ).rejects.toMatchObject({
        status: 400,
        message: "Cannot link to account without password",
      });
    });

    it("refuses a wrong password without firing the callback or writing", async () => {
      await seedUser();
      let callbackFired = false;

      await expect(
        oauth.linkGoogle(GOOGLE_ID, "person@example.com", "wrong", () => {
          callbackFired = true;
        }),
      ).rejects.toMatchObject({ status: 401, message: "Invalid password" });

      expect(callbackFired).toBe(false);
      expect(linkedGoogleIds).toEqual([]);
    });

    it("links, switches the auth provider and starts a session in one transaction", async () => {
      await seedUser();
      let callbackFired = false;

      const { start, userId } = await oauth.linkGoogle(
        GOOGLE_ID,
        "person@example.com",
        "Password1",
        () => {
          callbackFired = true;
        },
      );

      expect(callbackFired).toBe(true);
      expect(userId).toBe(USER_ID);
      expect(start.kind).toBe("session");
      expect(linkedGoogleIds).toEqual([
        { userId: USER_ID, googleId: GOOGLE_ID, client: txClient },
      ]);
      expect(providerChanges).toEqual([
        { userId: USER_ID, provider: "both", client: txClient },
      ]);
      expect(startSessionCalls[0].client).toBe(txClient);
    });

    it("returns mfa_required for an MFA-enabled account, the link already written", async () => {
      await seedUser();
      mfaEnabled = true;

      const { start } = await oauth.linkGoogle(
        GOOGLE_ID,
        "person@example.com",
        "Password1",
      );

      expect(start).toEqual({
        kind: "mfa_required",
        challengeToken: "challenge",
      });
      expect(linkedGoogleIds).toHaveLength(1);
    });
  });

  describe("unlinkGoogle", () => {
    it("refuses an unknown account", async () => {
      await expect(oauth.unlinkGoogle(USER_ID)).rejects.toMatchObject({
        status: 404,
        message: "User not found",
      });
    });

    it("refuses when no password is set", async () => {
      await seedUser({ password_hash: null });
      await expect(oauth.unlinkGoogle(USER_ID)).rejects.toMatchObject({
        status: 400,
        message: "Cannot unlink Google without a password set",
      });
      expect(unlinkedUserIds).toEqual([]);
    });

    it("unlinks when a password exists", async () => {
      await seedUser();
      await oauth.unlinkGoogle(USER_ID);
      expect(unlinkedUserIds).toEqual([USER_ID]);
    });
  });
});
