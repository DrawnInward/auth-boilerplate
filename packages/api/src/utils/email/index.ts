// Deliberately narrow: the builders and the provider lookup are the whole
// public surface. textToHtml and the wire types stay internal so a future
// caller can't hand-roll a send around the email service.
export { getEmailProvider } from "./providers";
export {
  buildAccountExistsEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildOrgInviteEmail,
  buildMfaDisabledEmail,
  buildMfaEnabledEmail,
  buildEmailChangeVerificationEmail,
  buildEmailChangeNotificationEmail,
  buildAdminInviteEmail,
  buildAdminRegistrationInviteEmail,
} from "./templates";
