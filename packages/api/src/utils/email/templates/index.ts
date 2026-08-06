// Pure builders: each returns EmailOptions and performs no IO, so the copy is
// unit-testable and sending is the email service's job.
export { buildAccountExistsEmail } from "./accountExistsEmail";
export { buildVerificationEmail } from "./verificationEmail";
export { buildPasswordResetEmail } from "./passwordResetEmail";
export { buildOrgInviteEmail } from "./orgInviteEmail";
export { buildMfaEnabledEmail } from "./mfaEnabledEmail";
export { buildMfaDisabledEmail } from "./mfaDisabledEmail";
export { buildEmailChangeVerificationEmail } from "./emailChangeVerificationEmail";
export { buildEmailChangeNotificationEmail } from "./emailChangeNotificationEmail";
export { buildAdminInviteEmail } from "./adminInviteEmail";
export { buildAdminRegistrationInviteEmail } from "./adminRegistrationInviteEmail";
