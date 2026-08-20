// Account-lifecycle mutations that must end sessions, fused with the
// revocation they imply. Before this service the pairing lived inline in
// each admin controller, which is a remembered-per-call-site rule; here
// "this write changes whether the account is valid" and "its sessions die in
// the same transaction" are one call that cannot be taken apart. (S4, and
// the Step-9 reactivation rule below.)

import { Pool, PoolClient } from "pg";
import { RunTransaction } from "../utils/withTransaction";
import { SafeAdmin, SafeUser, UserPatchDto } from "../types";

// The fields that decide whether an account is valid at all. A change to any
// of them — in EITHER direction — revokes every live session. Deactivating
// or deleting kills the open tab (S4). Reactivating revokes too, so an
// account provably restarts with zero sessions: it closes the one gap
// revoke-on-disable cannot reach — a deactivation done as an out-of-band DB
// write (where no revoke hook ran) followed by a reactivate through the API
// would otherwise hand back every session that survived it.
//
// It must be a CHANGE, not mere presence: the admin edit form submits
// is_active on every save, so revoking on presence would log the user out
// of every device each time an admin fixes a typo in their email. For the
// timestamps, validity depends on whether they are set, not on the instant
// they hold.
export const accountValidityChanged = (
  before: Pick<SafeUser, "is_active" | "deleted_at" | "deactivated_at">,
  updates: UserPatchDto,
): boolean => {
  if (
    updates.is_active !== undefined &&
    updates.is_active !== Boolean(before.is_active)
  ) {
    return true;
  }
  if (
    updates.deleted_at !== undefined &&
    (updates.deleted_at == null) !== (before.deleted_at == null)
  ) {
    return true;
  }
  if (
    updates.deactivated_at !== undefined &&
    (updates.deactivated_at == null) !== (before.deactivated_at == null)
  ) {
    return true;
  }
  return false;
};

// Fallback when the before-state is unknowable (e.g. the row is invisible to
// the safe reader): presence of a validity field errs on the side of
// revoking — a spurious logout beats a surviving session.
const touchesAccountValidity = (updates: UserPatchDto): boolean =>
  updates.is_active !== undefined ||
  updates.deleted_at !== undefined ||
  updates.deactivated_at !== undefined;

export type AccountServiceDeps = {
  users: {
    getUserById: (
      userId: string,
      client?: PoolClient | Pool,
    ) => Promise<SafeUser | null>;
    modifyUser: (
      userId: string,
      updates: UserPatchDto,
      client?: PoolClient | Pool,
    ) => Promise<SafeUser>;
    deleteUser: (
      userId: string,
      client?: PoolClient | Pool,
    ) => Promise<SafeUser>;
  };
  admins: {
    deactivateAdmin: (
      adminId: string,
      deactivatorId: string,
      client?: PoolClient | Pool,
    ) => Promise<SafeAdmin>;
  };
  revokeTokens: (
    roleId: string,
    roleType: "user" | "admin",
    client?: PoolClient | Pool,
  ) => Promise<string>;
  runTransaction: RunTransaction;
};

export type AccountService = {
  /**
   * Admin PUT on a user. Revokes the user's sessions in the same transaction
   * whenever the update CHANGES an account-validity field, in either
   * direction; an edit that leaves validity as it was revokes nothing.
   */
  updateUser(userId: string, updates: UserPatchDto): Promise<SafeUser>;
  /** Admin delete. A deleted account keeps no working sessions. */
  deleteUser(userId: string): Promise<SafeUser>;
  /** Admin-on-admin deactivation. A deactivated admin keeps no sessions. */
  disableAdmin(adminId: string, deactivatorId: string): Promise<SafeAdmin>;
};

export const createAccountService = ({
  users,
  admins,
  revokeTokens,
  runTransaction,
}: AccountServiceDeps): AccountService => ({
  updateUser: (userId, updates) =>
    runTransaction(async (client) => {
      // Read the pre-state inside the transaction so the change decision and
      // the write see the same row. Missing row: modifyUser owns the 404.
      const before = await users.getUserById(userId, client);
      const updated = await users.modifyUser(userId, updates, client);
      const mustRevoke = before
        ? accountValidityChanged(before, updates)
        : touchesAccountValidity(updates);
      if (mustRevoke) {
        await revokeTokens(userId, "user", client);
      }
      return updated;
    }),

  deleteUser: (userId) =>
    runTransaction(async (client) => {
      const deleted = await users.deleteUser(userId, client);
      await revokeTokens(userId, "user", client);
      return deleted;
    }),

  disableAdmin: (adminId, deactivatorId) =>
    runTransaction(async (client) => {
      // The model refuses to deactivate the only active root admin, which is
      // the last-admin protection: root is the only caller of this path, so
      // a root self-lockout is structurally impossible.
      const deactivated = await admins.deactivateAdmin(
        adminId,
        deactivatorId,
        client,
      );
      await revokeTokens(adminId, "admin", client);
      return deactivated;
    }),
});
