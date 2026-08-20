// The account's credentials and identity — password, email, MFA, and the
// registration that establishes them — each fused with what must happen in
// the same transaction (the invitation burn, the session revoke, the first
// session's issue). Before this service each of these lived as an inline
// transaction in a controller, so "reset a password" could only ever be
// triggered by an HTTP request; here it is one callable behaviour.
//
// Client discipline (the pool-wedge class from the hardening reviews): no
// bcrypt runs while a connection is held, and nothing inside a transaction
// acquires a second one — reads in there go through the client. The two
// hashing flows (registration, password reset) pre-validate the token on the
// pool first, so a junk token costs one indexed SELECT instead of ~250ms of
// bcrypt on an unauthenticated endpoint; they then re-validate under FOR
// UPDATE inside, and that locked read is the authoritative one — it re-checks
// expiry and the D2 soft-deleted-org rule that markInvitationUsed's
// compare-and-set alone would not. A flow with no bcrypt to protect
// (confirmEmailChange) validates once, inside.

import type * as userModels from "../models/users.models";
import type * as adminModels from "../models/admins.models";
import type * as invitationModels from "../models/invitations.models";
import type * as mfaModels from "../models/mfa.models";
import type * as refreshModels from "../models/refresh.models";
import {
  CompleteRegistrationDto,
  ResetPasswordDto,
} from "@auth-boilerplate/shared";
import { InvitationRow, SafeAdmin, SafeUser } from "../types";
import { httpError } from "../utils/httpError";
import { RunTransaction } from "../utils/withTransaction";
import { AuthService, SessionTokens } from "./auth.service";

export type CredentialServiceDeps = {
  users: Pick<
    typeof userModels,
    | "createUser"
    | "getUser"
    | "getUserById"
    | "getUserWithPasswordById"
    | "updatePassword"
    | "setAuthProvider"
    | "modifyUser"
  >;
  admins: Pick<typeof adminModels, "createAdmin">;
  invitations: Pick<
    typeof invitationModels,
    "validateInvitationToken" | "markInvitationUsed"
  >;
  mfa: Pick<typeof mfaModels, "disableMfa" | "deleteAllBackupCodes">;
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  revokeTokens: typeof refreshModels.revokeUserTokens;
  issueSession: AuthService["issueSession"];
  runTransaction: RunTransaction;
};

export type CredentialService = {
  /**
   * Registration or admin-invite token → new user with a live session.
   * Burns the token and issues the session in the creating transaction.
   */
  completeRegistration(
    input: CompleteRegistrationDto,
  ): Promise<{ user: SafeUser } & SessionTokens>;
  /** The admin analogue: admin_registration token → admin with a session. */
  completeAdminRegistration(
    input: ResetPasswordDto,
  ): Promise<{ admin: SafeAdmin } & SessionTokens>;
  /** Burns the token and ends every session. */
  resetPassword(input: ResetPasswordDto): Promise<void>;
  /** First password for an OAuth-only account; the account becomes "both". */
  setPassword(userId: string, password: string): Promise<void>;
  /** Ends every session, so other devices must sign in again. */
  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void>;
  /** Email-change token → the new address, if still free; burns the token. */
  confirmEmailChange(token: string): Promise<InvitationRow>;
  /**
   * Admin-driven MFA removal: clears the flag and every backup code in one
   * transaction. Returns the user so the caller can notify them after commit.
   */
  disableUserMfa(userId: string): Promise<SafeUser>;
};

export const createCredentialService = ({
  users,
  admins,
  invitations,
  mfa,
  hashPassword,
  verifyPassword,
  revokeTokens,
  issueSession,
  runTransaction,
}: CredentialServiceDeps): CredentialService => ({
  completeRegistration: async ({ token, password }) => {
    const preview = await invitations.validateInvitationToken(token);
    if (preview.type !== "registration" && preview.type !== "admin_invite") {
      throw httpError(400, "Invalid invitation type for registration");
    }
    const passwordHash = await hashPassword(password);

    return runTransaction(async (client) => {
      const invitation = await invitations.validateInvitationToken(
        token,
        undefined,
        client,
      );
      const user = await users.createUser(
        {
          email: invitation.email,
          password_hash: passwordHash,
          email_verified: true,
          is_active: true,
          created_through:
            invitation.type === "admin_invite"
              ? "admin_created"
              : "self_registered",
        },
        client,
      );
      await invitations.markInvitationUsed(invitation.id!, client);
      const tokens = await issueSession(
        {
          role_type: "user",
          role_id: user.user_id!,
          is_active: user.is_active === true,
          email_verified: user.email_verified === true,
        },
        client,
      );
      return { ...tokens, user };
    });
  },

  completeAdminRegistration: async ({ token, password }) => {
    await invitations.validateInvitationToken(token, "admin_registration");
    const passwordHash = await hashPassword(password);

    return runTransaction(async (client) => {
      const invitation = await invitations.validateInvitationToken(
        token,
        "admin_registration",
        client,
      );
      const admin = await admins.createAdmin(
        {
          email: invitation.email,
          password_hash: passwordHash,
          email_verified: true,
          is_active: true,
        },
        client,
      );
      await invitations.markInvitationUsed(invitation.id!, client);
      const tokens = await issueSession(
        {
          role_type: "admin",
          role_id: admin.admin_id!,
          is_active: admin.is_active === true,
          root: admin.root === true,
        },
        client,
      );
      return { ...tokens, admin };
    });
  },

  resetPassword: async ({ token, password }) => {
    const preview = await invitations.validateInvitationToken(
      token,
      "password_reset",
    );
    // Both refusals land before any bcrypt; the reads inside the transaction
    // are the authoritative ones.
    if (!(await users.getUser(preview.email))) {
      throw httpError(404, "User not found");
    }
    const passwordHash = await hashPassword(password);

    await runTransaction(async (client) => {
      const invitation = await invitations.validateInvitationToken(
        token,
        "password_reset",
        client,
      );
      // Resolved inside the transaction: a pool snapshot taken before the
      // lock could name a user an admin has deleted or renamed since.
      const user = await users.getUser(invitation.email, {}, client);
      if (!user) {
        throw httpError(404, "User not found");
      }
      await users.updatePassword(user.user_id!, passwordHash, client);
      await invitations.markInvitationUsed(invitation.id!, client);
      await revokeTokens(user.user_id!, "user", client);
    });
  },

  setPassword: async (userId, password) => {
    const user = await users.getUserWithPasswordById(userId);
    if (!user) {
      throw httpError(404, "User not found");
    }
    if (user.password_hash) {
      throw httpError(400, "Password already set. Use password reset instead.");
    }
    const passwordHash = await hashPassword(password);

    await runTransaction(async (client) => {
      await users.updatePassword(userId, passwordHash, client);
      await users.setAuthProvider(userId, "both", client);
    });
  },

  changePassword: async (userId, currentPassword, newPassword) => {
    const user = await users.getUserWithPasswordById(userId);
    if (!user) {
      throw httpError(404, "User not found");
    }
    if (!user.password_hash) {
      throw httpError(
        400,
        "No password set. Use set-password endpoint instead.",
      );
    }
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throw httpError(401, "Current password is incorrect");
    }
    const passwordHash = await hashPassword(newPassword);

    await runTransaction(async (client) => {
      await users.updatePassword(userId, passwordHash, client);
      await revokeTokens(userId, "user", client);
    });
  },

  confirmEmailChange: (token) =>
    runTransaction(async (client) => {
      const invitation = await invitations.validateInvitationToken(
        token,
        "email_change",
        client,
      );
      if (!invitation.new_email || !invitation.user_id) {
        throw httpError(400, "Invalid email change invitation");
      }

      // Through the transaction client; a concurrent claim of the same
      // address still lands on the users.email unique index (409).
      const existingUser = await users.getUser(
        invitation.new_email,
        {},
        client,
      );
      if (existingUser) {
        throw httpError(409, "Email is no longer available");
      }

      await users.modifyUser(
        invitation.user_id,
        { email: invitation.new_email.toLowerCase() },
        client,
      );
      await invitations.markInvitationUsed(invitation.id!, client);
      return invitation;
    }),

  disableUserMfa: (userId) =>
    runTransaction(async (client) => {
      const user = await users.getUserById(userId, client);
      if (!user) {
        throw httpError(404, "User not found");
      }
      if (!user.mfa_enabled) {
        throw httpError(400, "MFA is not enabled for this user");
      }

      await mfa.disableMfa(userId, "user", client);
      await mfa.deleteAllBackupCodes(userId, "user", client);
      return user;
    }),
});
