import { PoolClient } from "pg";
import {
  accountValidityChanged,
  createAccountService,
} from "../../src/services/account.service";
import { SafeAdmin, SafeUser, UserPatchDto } from "../../src/types";

// The service exists so "this write changes whether the account is valid"
// and "its sessions die in the same transaction" cannot be taken apart.
// These tests pin the two halves: WHICH updates revoke (a CHANGE in either
// direction — never mere presence, since the admin form submits is_active on
// every save), and that write + revoke share one client.

const CLIENT = { sentinel: "txn-client" } as unknown as PoolClient;

const ACTIVE = {
  is_active: true,
  deleted_at: null,
  deactivated_at: null,
} as unknown as SafeUser;

const DEACTIVATED = {
  is_active: false,
  deleted_at: null,
  deactivated_at: "2026-08-01T00:00:00Z",
} as unknown as SafeUser;

const buildService = (before: SafeUser | null = ACTIVE) => {
  const calls: {
    modify: Array<{ userId: string; updates: UserPatchDto; client: unknown }>;
    del: Array<{ userId: string; client: unknown }>;
    disable: Array<{
      adminId: string;
      deactivatorId: string;
      client: unknown;
    }>;
    revoke: Array<{ roleId: string; roleType: string; client: unknown }>;
  } = { modify: [], del: [], disable: [], revoke: [] };

  const service = createAccountService({
    users: {
      getUserById: async () => before,
      modifyUser: async (userId, updates, client) => {
        calls.modify.push({ userId, updates, client });
        return { user_id: userId } as SafeUser;
      },
      deleteUser: async (userId, client) => {
        calls.del.push({ userId, client });
        return { user_id: userId } as SafeUser;
      },
    },
    admins: {
      deactivateAdmin: async (adminId, deactivatorId, client) => {
        calls.disable.push({ adminId, deactivatorId, client });
        return { admin_id: adminId } as SafeAdmin;
      },
    },
    revokeTokens: async (roleId, roleType, client) => {
      calls.revoke.push({ roleId, roleType, client });
      return "revoked";
    },
    runTransaction: (fn) => fn(CLIENT),
  });

  return { service, calls };
};

describe("accountValidityChanged", () => {
  it.each<[string, SafeUser, UserPatchDto]>([
    ["deactivation", ACTIVE, { is_active: false }],
    ["reactivation", DEACTIVATED, { is_active: true }],
    ["soft delete", ACTIVE, { deleted_at: "2026-08-19T00:00:00Z" }],
    [
      "a deactivation timestamp",
      ACTIVE,
      { deactivated_at: "2026-08-19T00:00:00Z" },
    ],
    [
      "clearing the deactivation timestamp",
      DEACTIVATED,
      { deactivated_at: null },
    ],
  ])("is true for %s", (_label, before, updates) => {
    expect(accountValidityChanged(before, updates)).toBe(true);
  });

  it.each<[string, SafeUser, UserPatchDto]>([
    ["a plain profile edit", ACTIVE, { email: "new@example.com" }],
    ["an empty patch", ACTIVE, {}],
    // The admin form submits is_active on every save — an unchanged value
    // must never log the user out of every device.
    ["an unchanged is_active: true", ACTIVE, { is_active: true }],
    ["an unchanged is_active: false", DEACTIVATED, { is_active: false }],
    // Both set: the instant changed but validity did not.
    [
      "moving a set deactivation timestamp",
      DEACTIVATED,
      { deactivated_at: "2026-08-19T00:00:00Z" },
    ],
  ])("is false for %s", (_label, before, updates) => {
    expect(accountValidityChanged(before, updates)).toBe(false);
  });
});

describe("accountService.updateUser", () => {
  it.each<[string, SafeUser, UserPatchDto]>([
    ["deactivating", ACTIVE, { is_active: false }],
    // Reactivation revokes too: an account must provably restart with zero
    // sessions, even when the deactivation happened as an out-of-band DB
    // write where no revoke hook ran.
    ["reactivating", DEACTIVATED, { is_active: true }],
    ["soft-deleting", ACTIVE, { deleted_at: "2026-08-19T00:00:00Z" }],
    ["restoring a deactivation", DEACTIVATED, { deactivated_at: null }],
  ])("revokes the user's sessions when %s", async (_label, before, updates) => {
    const { service, calls } = buildService(before);

    await service.updateUser("user-1", updates);

    expect(calls.revoke).toEqual([
      { roleId: "user-1", roleType: "user", client: CLIENT },
    ]);
  });

  it.each<[string, SafeUser, UserPatchDto]>([
    ["a plain profile edit", ACTIVE, { email: "new@example.com" }],
    ["an is_active the row already has", ACTIVE, { is_active: true }],
  ])("does not revoke on %s", async (_label, before, updates) => {
    const { service, calls } = buildService(before);

    await service.updateUser("user-1", updates);

    expect(calls.revoke).toEqual([]);
  });

  // The safe reader can miss a row (e.g. soft-deleted). With no before-state
  // to compare, presence of a validity field errs toward revoking.
  it("falls back to presence when the before-state is unreadable", async () => {
    const { service, calls } = buildService(null);

    await service.updateUser("user-1", { is_active: true });
    expect(calls.revoke).toHaveLength(1);

    await service.updateUser("user-1", { email: "e@example.com" });
    expect(calls.revoke).toHaveLength(1);
  });

  it("runs the write and the revoke on the same transaction client", async () => {
    const { service, calls } = buildService();

    const result = await service.updateUser("user-1", { is_active: false });

    expect(result).toEqual({ user_id: "user-1" });
    expect(calls.modify).toEqual([
      {
        userId: "user-1",
        updates: { is_active: false },
        client: CLIENT,
      },
    ]);
    expect(calls.revoke[0].client).toBe(CLIENT);
  });
});

describe("accountService.deleteUser", () => {
  it("always revokes, on the same client", async () => {
    const { service, calls } = buildService();

    const result = await service.deleteUser("user-2");

    expect(result).toEqual({ user_id: "user-2" });
    expect(calls.del).toEqual([{ userId: "user-2", client: CLIENT }]);
    expect(calls.revoke).toEqual([
      { roleId: "user-2", roleType: "user", client: CLIENT },
    ]);
  });
});

describe("accountService.disableAdmin", () => {
  it("deactivates and revokes as admin, on the same client", async () => {
    const { service, calls } = buildService();

    const result = await service.disableAdmin("admin-1", "root-admin");

    expect(result).toEqual({ admin_id: "admin-1" });
    expect(calls.disable).toEqual([
      { adminId: "admin-1", deactivatorId: "root-admin", client: CLIENT },
    ]);
    expect(calls.revoke).toEqual([
      { roleId: "admin-1", roleType: "admin", client: CLIENT },
    ]);
  });
});
