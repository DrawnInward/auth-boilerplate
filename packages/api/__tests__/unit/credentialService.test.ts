import { PoolClient } from "pg";
import {
  createCredentialService,
  CredentialServiceDeps,
} from "../../src/services";
import { InvitationRow, SafeAdmin, SafeUser, User } from "../../src/types";

// Each flow here is a write fused with what must commit alongside it (the
// token burn, the revoke, the first session). The tests pin WHICH calls
// happen, that refusals happen before any write, and that the writes share
// the transaction client.

const CLIENT = { sentinel: "txn-client" } as unknown as PoolClient;
const USER_ID = "33333333-3333-3333-3333-333333333333";
const ADMIN_ID = "55555555-5555-5555-5555-555555555555";
const INVITATION_ID = "44444444-4444-4444-4444-444444444444";

const invitationOf = (overrides: Partial<InvitationRow>): InvitationRow =>
  ({
    id: INVITATION_ID,
    email: "person@example.com",
    type: "registration",
    new_email: null,
    user_id: null,
    ...overrides,
  }) as unknown as InvitationRow;

type Calls = {
  createUser: Array<{ dto: Record<string, unknown>; client: unknown }>;
  createAdmin: Array<{ dto: Record<string, unknown>; client: unknown }>;
  updatePassword: Array<{ userId: string; hash: string; client: unknown }>;
  setAuthProvider: Array<{ userId: string; provider: string; client: unknown }>;
  modifyUser: Array<{
    userId: string;
    updates: Record<string, unknown>;
    client: unknown;
  }>;
  markUsed: Array<{ id: string; client: unknown }>;
  disableMfa: Array<{ roleId: string; client: unknown }>;
  deleteCodes: Array<{ roleId: string; client: unknown }>;
  revoke: Array<{ roleId: string; roleType: string; client: unknown }>;
  issueSession: Array<{ principal: Record<string, unknown>; client: unknown }>;
  validate: Array<{ token: string; type: unknown; client: unknown }>;
  getUserById: Array<{ userId: string; client: unknown }>;
  getUser: Array<{ email: string; client: unknown }>;
};

type World = {
  invitationByToken: Map<string, InvitationRow>;
  userByEmail: Map<string, SafeUser>;
  userById: Map<string, User>;
};

const buildService = (world: Partial<World> = {}) => {
  const w: World = {
    invitationByToken: new Map(),
    userByEmail: new Map(),
    userById: new Map(),
    ...world,
  };
  const calls: Calls = {
    createUser: [],
    createAdmin: [],
    updatePassword: [],
    setAuthProvider: [],
    modifyUser: [],
    markUsed: [],
    disableMfa: [],
    deleteCodes: [],
    revoke: [],
    issueSession: [],
    validate: [],
    getUserById: [],
    getUser: [],
  };

  const deps = {
    users: {
      createUser: async (dto, client) => {
        calls.createUser.push({ dto, client });
        return { user_id: USER_ID, ...dto } as unknown as SafeUser;
      },
      getUser: async (email, _options, client) => {
        calls.getUser.push({ email, client });
        return w.userByEmail.get(email) ?? null;
      },
      getUserById: async (userId, client) => {
        calls.getUserById.push({ userId, client });
        return (w.userById.get(userId) as SafeUser | undefined) ?? null;
      },
      getUserWithPasswordById: async (userId) => w.userById.get(userId) ?? null,
      updatePassword: async (userId, hash, client) => {
        calls.updatePassword.push({ userId, hash, client });
        return true;
      },
      setAuthProvider: async (userId, provider, client) => {
        calls.setAuthProvider.push({ userId, provider, client });
        return {} as SafeUser;
      },
      modifyUser: async (userId, updates, client) => {
        calls.modifyUser.push({ userId, updates, client });
        return {} as SafeUser;
      },
    },
    admins: {
      createAdmin: async (dto, client) => {
        calls.createAdmin.push({ dto, client });
        return {
          admin_id: ADMIN_ID,
          root: false,
          ...dto,
        } as unknown as SafeAdmin;
      },
    },
    invitations: {
      validateInvitationToken: async (token, type, client) => {
        calls.validate.push({ token, type, client });
        const found = w.invitationByToken.get(token);
        if (!found) throw { status: 400, msg: "Invalid or expired token" };
        return found;
      },
      markInvitationUsed: async (id, client) => {
        calls.markUsed.push({ id, client });
        return {} as InvitationRow;
      },
    },
    mfa: {
      disableMfa: async (roleId, _roleType, client) => {
        calls.disableMfa.push({ roleId, client });
      },
      deleteAllBackupCodes: async (roleId, _roleType, client) => {
        calls.deleteCodes.push({ roleId, client });
      },
    },
    hashPassword: async (password) => `hashed:${password}`,
    verifyPassword: async (password, hash) => hash === `hashed:${password}`,
    revokeTokens: async (roleId, roleType, client) => {
      calls.revoke.push({ roleId, roleType, client });
      return "revoked";
    },
    issueSession: async (principal, client) => {
      calls.issueSession.push({ principal, client });
      return { accessToken: "access", refreshToken: "refresh" };
    },
    runTransaction: (fn) => fn(CLIENT),
  } satisfies CredentialServiceDeps;

  return { service: createCredentialService(deps), calls, world: w };
};

const userRow = (overrides: Partial<User> = {}): User =>
  ({
    user_id: USER_ID,
    email: "person@example.com",
    password_hash: "hashed:Current1",
    is_active: true,
    email_verified: true,
    mfa_enabled: false,
    ...overrides,
  }) as unknown as User;

describe("credentialService.completeRegistration", () => {
  it.each([
    ["registration", "self_registered"],
    ["admin_invite", "admin_created"],
  ])(
    "turns a %s token into a user, burns it, issues the session",
    async (type, createdThrough) => {
      const { service, calls } = buildService({
        invitationByToken: new Map([
          ["tok", invitationOf({ type: type as InvitationRow["type"] })],
        ]),
      });

      const result = await service.completeRegistration({
        token: "tok",
        password: "Secret1",
      });

      expect(calls.createUser).toEqual([
        {
          dto: {
            email: "person@example.com",
            password_hash: "hashed:Secret1",
            email_verified: true,
            is_active: true,
            created_through: createdThrough,
          },
          client: CLIENT,
        },
      ]);
      expect(calls.markUsed).toEqual([{ id: INVITATION_ID, client: CLIENT }]);
      expect(calls.issueSession).toEqual([
        {
          principal: {
            role_type: "user",
            role_id: USER_ID,
            is_active: true,
            email_verified: true,
          },
          client: CLIENT,
        },
      ]);
      expect(result).toMatchObject({
        accessToken: "access",
        refreshToken: "refresh",
        user: { user_id: USER_ID },
      });
    },
  );

  it("refuses any other token type before creating anything", async () => {
    const { service, calls } = buildService({
      invitationByToken: new Map([
        ["tok", invitationOf({ type: "password_reset" })],
      ]),
    });

    await expect(
      service.completeRegistration({ token: "tok", password: "Secret1" }),
    ).rejects.toMatchObject({
      status: 400,
      msg: "Invalid invitation type for registration",
    });
    expect(calls.createUser).toEqual([]);
    expect(calls.markUsed).toEqual([]);
    expect(calls.issueSession).toEqual([]);
  });
});

describe("credentialService.completeAdminRegistration", () => {
  it("requires an admin_registration token and issues an admin session", async () => {
    const { service, calls } = buildService({
      invitationByToken: new Map([
        ["tok", invitationOf({ type: "admin_registration" })],
      ]),
    });

    const result = await service.completeAdminRegistration({
      token: "tok",
      password: "Secret1",
    });

    // Cheap pool pre-check first, then the authoritative locked read.
    expect(calls.validate).toEqual([
      { token: "tok", type: "admin_registration", client: undefined },
      { token: "tok", type: "admin_registration", client: CLIENT },
    ]);
    expect(calls.createAdmin).toEqual([
      {
        dto: {
          email: "person@example.com",
          password_hash: "hashed:Secret1",
          email_verified: true,
          is_active: true,
        },
        client: CLIENT,
      },
    ]);
    expect(calls.markUsed).toEqual([{ id: INVITATION_ID, client: CLIENT }]);
    expect(calls.issueSession).toEqual([
      {
        principal: {
          role_type: "admin",
          role_id: ADMIN_ID,
          is_active: true,
          root: false,
        },
        client: CLIENT,
      },
    ]);
    expect(result.admin.admin_id).toBe(ADMIN_ID);
  });
});

describe("credentialService.resetPassword", () => {
  it("stores the new hash, burns the token and revokes every session together", async () => {
    const { service, calls } = buildService({
      invitationByToken: new Map([
        ["tok", invitationOf({ type: "password_reset" })],
      ]),
      userByEmail: new Map([
        ["person@example.com", { user_id: USER_ID } as SafeUser],
      ]),
    });

    await service.resetPassword({ token: "tok", password: "New1" });

    expect(calls.validate[0]).toMatchObject({ type: "password_reset" });
    // Cheap pool refusal first, then the authoritative read under the lock:
    // dropping the client from the second would silently restore the wedge.
    expect(calls.getUser).toEqual([
      { email: "person@example.com", client: undefined },
      { email: "person@example.com", client: CLIENT },
    ]);
    expect(calls.updatePassword).toEqual([
      { userId: USER_ID, hash: "hashed:New1", client: CLIENT },
    ]);
    expect(calls.markUsed).toEqual([{ id: INVITATION_ID, client: CLIENT }]);
    expect(calls.revoke).toEqual([
      { roleId: USER_ID, roleType: "user", client: CLIENT },
    ]);
  });

  it("404s when the token's account no longer exists, writing nothing", async () => {
    const { service, calls } = buildService({
      invitationByToken: new Map([
        ["tok", invitationOf({ type: "password_reset" })],
      ]),
    });

    await expect(
      service.resetPassword({ token: "tok", password: "New1" }),
    ).rejects.toMatchObject({ status: 404, msg: "User not found" });
    expect(calls.updatePassword).toEqual([]);
    expect(calls.markUsed).toEqual([]);
    expect(calls.revoke).toEqual([]);
  });
});

describe("credentialService.setPassword", () => {
  it("sets the first password and widens the auth provider to both", async () => {
    const { service, calls } = buildService({
      userById: new Map([[USER_ID, userRow({ password_hash: null })]]),
    });

    await service.setPassword(USER_ID, "First1");

    expect(calls.updatePassword).toEqual([
      { userId: USER_ID, hash: "hashed:First1", client: CLIENT },
    ]);
    expect(calls.setAuthProvider).toEqual([
      { userId: USER_ID, provider: "both", client: CLIENT },
    ]);
    expect(calls.revoke).toEqual([]);
  });

  it("refuses when a password already exists", async () => {
    const { service, calls } = buildService({
      userById: new Map([[USER_ID, userRow()]]),
    });

    await expect(service.setPassword(USER_ID, "First1")).rejects.toMatchObject({
      status: 400,
      msg: "Password already set. Use password reset instead.",
    });
    expect(calls.updatePassword).toEqual([]);
  });

  it("404s for an unknown user", async () => {
    const { service } = buildService();

    await expect(service.setPassword(USER_ID, "First1")).rejects.toMatchObject({
      status: 404,
      msg: "User not found",
    });
  });
});

describe("credentialService.changePassword", () => {
  it("verifies the current password, stores the new one and revokes sessions", async () => {
    const { service, calls } = buildService({
      userById: new Map([[USER_ID, userRow()]]),
    });

    await service.changePassword(USER_ID, "Current1", "Next1");

    expect(calls.updatePassword).toEqual([
      { userId: USER_ID, hash: "hashed:Next1", client: CLIENT },
    ]);
    expect(calls.revoke).toEqual([
      { roleId: USER_ID, roleType: "user", client: CLIENT },
    ]);
  });

  it.each<[string, User | undefined, number, string]>([
    ["an unknown user", undefined, 404, "User not found"],
    [
      "an account with no password",
      userRow({ password_hash: null }),
      400,
      "No password set. Use set-password endpoint instead.",
    ],
    [
      "a wrong current password",
      userRow({ password_hash: "hashed:Other" }),
      401,
      "Current password is incorrect",
    ],
  ])(
    "refuses %s without writing or revoking",
    async (_label, row, status, msg) => {
      const { service, calls } = buildService({
        userById: row ? new Map([[USER_ID, row]]) : new Map(),
      });

      await expect(
        service.changePassword(USER_ID, "Current1", "Next1"),
      ).rejects.toMatchObject({ status, msg });
      expect(calls.updatePassword).toEqual([]);
      expect(calls.revoke).toEqual([]);
    },
  );
});

describe("credentialService.confirmEmailChange", () => {
  const emailChange = invitationOf({
    type: "email_change",
    new_email: "New.Address@example.com",
    user_id: USER_ID,
  });

  it("moves the account to the lower-cased new address and burns the token", async () => {
    const { service, calls } = buildService({
      invitationByToken: new Map([["tok", emailChange]]),
    });

    const result = await service.confirmEmailChange("tok");

    expect(calls.validate[0]).toMatchObject({ type: "email_change" });
    // The availability check must run on the transaction client, not the pool.
    expect(calls.getUser).toEqual([
      { email: "New.Address@example.com", client: CLIENT },
    ]);
    expect(calls.modifyUser).toEqual([
      {
        userId: USER_ID,
        updates: { email: "new.address@example.com" },
        client: CLIENT,
      },
    ]);
    expect(calls.markUsed).toEqual([{ id: INVITATION_ID, client: CLIENT }]);
    expect(result).toBe(emailChange);
  });

  it("409s when the address was taken in the meantime, burning nothing", async () => {
    const { service, calls } = buildService({
      invitationByToken: new Map([["tok", emailChange]]),
      userByEmail: new Map([
        ["New.Address@example.com", { user_id: "other" } as SafeUser],
      ]),
    });

    await expect(service.confirmEmailChange("tok")).rejects.toMatchObject({
      status: 409,
      msg: "Email is no longer available",
    });
    expect(calls.modifyUser).toEqual([]);
    expect(calls.markUsed).toEqual([]);
  });

  it("400s a malformed email-change invitation", async () => {
    const { service, calls } = buildService({
      invitationByToken: new Map([
        ["tok", invitationOf({ type: "email_change", new_email: null })],
      ]),
    });

    await expect(service.confirmEmailChange("tok")).rejects.toMatchObject({
      status: 400,
      msg: "Invalid email change invitation",
    });
    expect(calls.modifyUser).toEqual([]);
  });
});

describe("credentialService.disableUserMfa", () => {
  it("clears the flag and every backup code through the transaction client", async () => {
    const { service, calls } = buildService({
      userById: new Map([[USER_ID, userRow({ mfa_enabled: true })]]),
    });

    const user = await service.disableUserMfa(USER_ID);

    expect(calls.getUserById).toEqual([{ userId: USER_ID, client: CLIENT }]);
    expect(calls.disableMfa).toEqual([{ roleId: USER_ID, client: CLIENT }]);
    expect(calls.deleteCodes).toEqual([{ roleId: USER_ID, client: CLIENT }]);
    expect(user.email).toBe("person@example.com");
  });

  it.each<[string, User | undefined, number, string]>([
    ["an unknown user", undefined, 404, "User not found"],
    [
      "a user without MFA",
      userRow({ mfa_enabled: false }),
      400,
      "MFA is not enabled for this user",
    ],
  ])(
    "refuses %s without touching MFA state",
    async (_label, row, status, msg) => {
      const { service, calls } = buildService({
        userById: row ? new Map([[USER_ID, row]]) : new Map(),
      });

      await expect(service.disableUserMfa(USER_ID)).rejects.toMatchObject({
        status,
        msg,
      });
      expect(calls.disableMfa).toEqual([]);
      expect(calls.deleteCodes).toEqual([]);
    },
  );
});
