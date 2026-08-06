import jwt from "jsonwebtoken";
import { Pool, PoolClient } from "pg";
import {
  createAuthService,
  AuthService,
  SessionPrincipal,
  MfaCheckedPrincipal,
} from "../../src/services";
import { CreateRefreshTokenDto } from "../../src/types";

const USER_KEY = "user-access-key";
const ADMIN_KEY = "admin-access-key";

const activeUser: SessionPrincipal = {
  role_type: "user",
  role_id: "11111111-1111-1111-1111-111111111111",
  is_active: true,
  email_verified: true,
};

const activeAdmin: SessionPrincipal = {
  role_type: "admin",
  role_id: "22222222-2222-2222-2222-222222222222",
  is_active: true,
  root: true,
};

describe("authService", () => {
  let refreshCalls: { dto: CreateRefreshTokenDto; client: unknown }[];
  let challengeCalls: { roleId: string; roleType: string; client: unknown }[];
  let auth: AuthService;

  beforeEach(() => {
    refreshCalls = [];
    challengeCalls = [];
    auth = createAuthService({
      getAccessKey: (roleType) => (roleType === "admin" ? ADMIN_KEY : USER_KEY),
      addRefresh: async (dto, client) => {
        refreshCalls.push({ dto, client });
        return { token: "refresh-token", refresh_id: "rid" };
      },
      createMfaChallengeToken: async (roleId, roleType, client) => {
        challengeCalls.push({ roleId, roleType, client });
        return "challenge-token";
      },
    });
  });

  describe("issueSession", () => {
    it("mints a 15-minute user access token with the user claims", async () => {
      const { accessToken, refreshToken } = await auth.issueSession(activeUser);

      const claims = jwt.verify(accessToken, USER_KEY) as jwt.JwtPayload;
      expect(claims.role_id).toBe(activeUser.role_id);
      expect(claims.role_type).toBe("user");
      expect(claims.email_verified).toBe(true);
      expect(claims.exp! - claims.iat!).toBe(15 * 60);

      expect(refreshToken).toBe("refresh-token");
      expect(refreshCalls).toHaveLength(1);
      expect(refreshCalls[0].dto).toEqual({
        role_id: activeUser.role_id,
        role_type: "user",
      });
    });

    it("honours ACCESS_TOKEN_LIFETIME_SECONDS for the token lifetime", async () => {
      process.env.ACCESS_TOKEN_LIFETIME_SECONDS = "60";
      try {
        const { accessToken } = await auth.issueSession(activeUser);

        const claims = jwt.verify(accessToken, USER_KEY) as jwt.JwtPayload;
        expect(claims.exp! - claims.iat!).toBe(60);
      } finally {
        delete process.env.ACCESS_TOKEN_LIFETIME_SECONDS;
      }
    });

    it("mints an admin access token with the admin key and root claim", async () => {
      const { accessToken } = await auth.issueSession(activeAdmin);

      const claims = jwt.verify(accessToken, ADMIN_KEY) as jwt.JwtPayload;
      expect(claims.role_type).toBe("admin");
      expect(claims.root).toBe(true);
      expect(claims.email_verified).toBeUndefined();
    });

    it("refuses a deactivated principal before any token exists", async () => {
      await expect(
        auth.issueSession({ ...activeUser, is_active: false }),
      ).rejects.toMatchObject({ status: 403 });

      expect(refreshCalls).toHaveLength(0);
    });

    it("threads the caller's transaction client through to the refresh row", async () => {
      const client = { sentinel: true } as unknown as PoolClient | Pool;

      await auth.issueSession(activeUser, client);

      expect(refreshCalls[0].client).toBe(client);
    });
  });

  describe("startSession", () => {
    const mfaUser: MfaCheckedPrincipal = { ...activeUser, mfa_enabled: true };

    it("issues an MFA challenge instead of a session when MFA is enabled", async () => {
      const start = await auth.startSession(mfaUser);

      expect(start).toEqual({
        kind: "mfa_required",
        challengeToken: "challenge-token",
      });
      expect(challengeCalls[0]).toMatchObject({
        roleId: mfaUser.role_id,
        roleType: "user",
      });
      expect(refreshCalls).toHaveLength(0);
    });

    it("issues a full session when MFA is not enabled", async () => {
      const start = await auth.startSession({
        ...activeUser,
        mfa_enabled: false,
      });

      expect(start.kind).toBe("session");
      expect(challengeCalls).toHaveLength(0);
      expect(refreshCalls).toHaveLength(1);
    });

    // The inherited OAuth contract lets a deactivated MFA account start a
    // challenge; deactivation bites at issueSession, so no verify path can
    // turn that challenge into a session.
    it("still challenges a deactivated MFA account, but refuses it a session", async () => {
      const start = await auth.startSession({ ...mfaUser, is_active: false });
      expect(start.kind).toBe("mfa_required");

      await expect(
        auth.startSession({
          ...activeUser,
          is_active: false,
          mfa_enabled: false,
        }),
      ).rejects.toMatchObject({ status: 403 });

      expect(refreshCalls).toHaveLength(0);
    });

    it("threads the caller's transaction client through to the challenge row", async () => {
      const client = { sentinel: true } as unknown as PoolClient | Pool;

      await auth.startSession(mfaUser, client);

      expect(challengeCalls[0].client).toBe(client);
    });
  });
});
