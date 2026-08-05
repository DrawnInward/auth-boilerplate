// The composition root: the single place where services are handed their real
// dependencies. Everything below this file takes its collaborators as
// arguments, so swapping an adapter (a different email provider, a fake in a
// test) is a change here and nowhere else.
//
// loadEnv comes first: the config read below must see the .env file, whatever
// order the rest of the application happens to import things in.
import "../utils/loadEnv";

import { PoolClient } from "pg";
import db from "../database/db";
import { getAccessKey, getAppName, getFrontendUrl } from "../utils/config";
import { getEmailProvider } from "../utils/email";
import { EmailProvider } from "../interfaces/email";
import { addRefresh } from "../models/refresh.models";
import {
  createMfaChallengeToken,
  verifyMfaChallengeToken,
  guardMfaChallenge,
  failMfaChallenge,
  consumeMfaChallengeOrThrow,
} from "../utils/mfaChallenge";
import * as mfaStore from "../models/mfa.models";
import * as invitationModels from "../models/invitations.models";
import * as userModels from "../models/users.models";
import * as organizationModels from "../models/organization.models";
import * as memberModels from "../models/organizationMembers.models";
import {
  getAdminById,
  getAdminWithPasswordById,
} from "../models/admins.models";
import { withTransaction } from "../utils/withTransaction";
import { Admin, User } from "../types";
import { createAuthService, AuthService } from "./auth.service";
import { createEmailService, EmailService } from "./email.service";
import { createMfaService, MfaService } from "./mfa.service";
import {
  createInvitationService,
  InvitationService,
} from "./invitation.service";

export type SafeUser = Omit<User, "password_hash">;
export type SafeAdmin = Omit<Admin, "password_hash">;

export type Services = {
  auth: AuthService;
  email: EmailService;
  userMfa: MfaService<SafeUser>;
  adminMfa: MfaService<SafeAdmin>;
  invitation: InvitationService;
};

// The provider is resolved per send, as the old sendEmail helper did, so
// EMAIL_PROVIDER stays a runtime knob rather than becoming import-order
// sensitive.
const emailProvider: EmailProvider = {
  send: (options) => getEmailProvider().send(options),
};

const auth = createAuthService({
  getAccessKey,
  addRefresh,
  createMfaChallengeToken,
});

const email = createEmailService({
  provider: emailProvider,
  appName: getAppName(),
  frontendUrl: getFrontendUrl(),
});

const runTransaction = <T>(fn: (client: PoolClient) => Promise<T>) =>
  withTransaction(db, fn);

// Everything but the principal seam is identical between the two MFA services.
const mfaCommonDeps = {
  store: mfaStore,
  challenges: {
    verifyToken: verifyMfaChallengeToken,
    guard: guardMfaChallenge,
    fail: failMfaChallenge,
    consumeOrThrow: consumeMfaChallengeOrThrow,
  },
  runTransaction,
  issueSession: auth.issueSession,
  email: {
    sendMfaEnabled: email.sendMfaEnabled,
    sendMfaDisabled: email.sendMfaDisabled,
  },
};

export const services: Services = {
  auth,
  email,
  userMfa: createMfaService<SafeUser>({
    roleType: "user",
    principals: {
      getById: userModels.getUserById,
      getWithPasswordById: userModels.getUserWithPasswordById,
      // email_verified is deliberately true here, not the row's flag.
      toSessionPrincipal: (user) => ({
        role_type: "user",
        role_id: user.user_id!,
        is_active: user.is_active === true,
        email_verified: true,
      }),
    },
    ...mfaCommonDeps,
  }),
  adminMfa: createMfaService<SafeAdmin>({
    roleType: "admin",
    principals: {
      getById: getAdminById,
      getWithPasswordById: getAdminWithPasswordById,
      toSessionPrincipal: (admin) => ({
        role_type: "admin",
        role_id: admin.admin_id!,
        is_active: admin.is_active === true,
        root: admin.root === true,
      }),
    },
    ...mfaCommonDeps,
  }),
  invitation: createInvitationService({
    invitations: invitationModels,
    users: userModels,
    organizations: organizationModels,
    members: memberModels,
    startSession: auth.startSession,
    sendOrgInvite: email.sendOrgInvite,
    runTransaction,
  }),
};

export { createAuthService } from "./auth.service";
export type {
  AuthService,
  AuthServiceDeps,
  MfaCheckedPrincipal,
  SessionPrincipal,
  SessionStart,
  SessionTokens,
} from "./auth.service";
export { createEmailService } from "./email.service";
export type { EmailService, EmailServiceDeps } from "./email.service";
export { createMfaService } from "./mfa.service";
export type {
  MfaService,
  MfaServiceDeps,
  MfaStore,
  MfaChallengeGate,
  MfaPrincipalSource,
  MfaLoginResult,
  MfaStatusSummary,
} from "./mfa.service";
export { createInvitationService } from "./invitation.service";
export type {
  InvitationService,
  InvitationServiceDeps,
  InviteMemberParams,
  AcceptedInvitation,
} from "./invitation.service";
