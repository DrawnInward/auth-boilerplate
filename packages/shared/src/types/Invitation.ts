import { z } from "zod";
import { ASSIGNABLE_ORGANIZATION_ROLES } from "./Organization";

// Mirrors the invitations.type CHECK constraint in the migrations — the DB, the
// Zod enum and the API's internal schema must always carry the same values.
// admin_invite is an admin inviting a *user*; admin_registration is the root
// admin inviting a new *platform admin*.
export const INVITATION_TYPES = [
  "registration",
  "org_invite",
  "password_reset",
  "email_change",
  "admin_invite",
  "admin_registration",
] as const;

export const invitationTypeSchema = z.enum(INVITATION_TYPES);

export type InvitationType = z.infer<typeof invitationTypeSchema>;

export const orgInviteRoleSchema = z.enum(ASSIGNABLE_ORGANIZATION_ROLES);

export type OrgInviteRole = z.infer<typeof orgInviteRoleSchema>;

// The FE-visible contract. Deliberately WITHOUT token_hash: the credential
// digest never crosses the wire, and keeping it out of this schema means a
// handler returning a raw DB row (which carries it — the API-internal
// InvitationRow type) is a compiler error, not a hand-remembered strip.
export const invitationSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  type: invitationTypeSchema,
  organization_id: z.string().uuid().nullable().optional(),
  role: orgInviteRoleSchema.nullable().optional(),
  invited_by: z.string().uuid().nullable().optional(),
  is_existing_user: z.boolean().optional(),
  new_email: z.string().email().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  expires_at: z.string(),
  used_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export type Invitation = z.infer<typeof invitationSchema>;

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const completeRegistrationSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type CompleteRegistrationDto = z.infer<
  typeof completeRegistrationSchema
>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: orgInviteRoleSchema,
});

export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;

export const acceptInviteSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
});

export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;

export const publicInvitationSchema = z.object({
  email: z.string().email(),
  type: invitationTypeSchema,
  is_existing_user: z.boolean(),
  organization_id: z.string().uuid().nullable().optional(),
  organization_name: z.string().optional(),
  role: orgInviteRoleSchema.nullable().optional(),
});

export type PublicInvitation = z.infer<typeof publicInvitationSchema>;

// What a successful (non-MFA) accept returns. An MFA-enabled existing user
// gets { mfa_required: true, organization_id, role } and no session instead
// (hardening A2) — the FE narrows the union with its isMfaRequired guard.
export const acceptInviteResponseSchema = z.object({
  user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  role: orgInviteRoleSchema,
});

export type AcceptInviteResponseData = z.infer<
  typeof acceptInviteResponseSchema
>;

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type RequestEmailChangeDto = z.infer<typeof requestEmailChangeSchema>;
