// The one place the application asks for an email to be sent. Callers name the
// message and supply its subject matter; choosing the provider, applying the
// branding and rendering the template all happen here.
//
// The provider arrives as a dependency rather than being looked up, which is
// what makes this testable: unit tests pass MemoryEmailProvider and assert on
// what would have been sent.

import { EmailProvider } from "../interfaces/email";
import {
  buildAdminInviteEmail,
  buildEmailChangeNotificationEmail,
  buildEmailChangeVerificationEmail,
  buildMfaDisabledEmail,
  buildMfaEnabledEmail,
  buildOrgInviteEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "../utils/email";

export type EmailServiceDeps = {
  provider: EmailProvider;
  /** Branding, resolved once by the composition root. */
  appName: string;
  frontendUrl: string;
};

export type EmailService = {
  sendVerification(to: string, token: string): Promise<void>;
  sendPasswordReset(to: string, token: string): Promise<void>;
  sendAdminInvite(to: string, token: string): Promise<void>;
  sendOrgInvite(params: {
    to: string;
    token: string;
    organizationName: string;
    role: string;
    inviterEmail?: string;
  }): Promise<void>;
  sendMfaEnabled(to: string): Promise<void>;
  sendMfaDisabled(to: string): Promise<void>;
  sendEmailChangeVerification(newEmail: string, token: string): Promise<void>;
  sendEmailChangeNotification(
    currentEmail: string,
    newEmail: string,
  ): Promise<void>;
};

export const createEmailService = ({
  provider,
  appName,
  frontendUrl,
}: EmailServiceDeps): EmailService => {
  const branding = { appName, frontendUrl };

  return {
    sendVerification: (to, token) =>
      provider.send(buildVerificationEmail({ to, token, ...branding })),

    sendPasswordReset: (to, token) =>
      provider.send(buildPasswordResetEmail({ to, token, ...branding })),

    sendAdminInvite: (to, token) =>
      provider.send(buildAdminInviteEmail({ to, token, ...branding })),

    sendOrgInvite: (params) =>
      provider.send(buildOrgInviteEmail({ ...params, ...branding })),

    sendMfaEnabled: (to) =>
      provider.send(buildMfaEnabledEmail({ to, appName })),

    sendMfaDisabled: (to) =>
      provider.send(buildMfaDisabledEmail({ to, appName })),

    sendEmailChangeVerification: (newEmail, token) =>
      provider.send(
        buildEmailChangeVerificationEmail({ to: newEmail, token, ...branding }),
      ),

    sendEmailChangeNotification: (currentEmail, newEmail) =>
      provider.send(
        buildEmailChangeNotificationEmail({
          to: currentEmail,
          newEmail,
          appName,
        }),
      ),
  };
};
