import { z } from "zod";
import {
  invitationTypeSchema,
  orgInviteRoleSchema,
} from "@auth-boilerplate/shared";

// Vocabularies are defined once in the shared package (which mirrors the DB
// CHECK constraints) and re-exported here for the API's internal row schemas —
// never re-typed, or the two copies drift apart silently.
export { invitationTypeSchema, orgInviteRoleSchema };

export const invitationSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  token_hash: z.string().optional(),
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

export const createInvitationSchema = z.object({
  email: z.string().email(),
  type: invitationTypeSchema,
  organization_id: z.string().uuid().nullable().optional(),
  role: orgInviteRoleSchema.nullable().optional(),
  invited_by: z.string().uuid().nullable().optional(),
  new_email: z.string().email().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
});

// Schema for registration request body
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// Schema for completing registration
export const completeRegistrationSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Schema for forgot password request
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// Schema for reset password request
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Schema for org invite request
export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: orgInviteRoleSchema,
});

// Schema for accepting an org invite
export const acceptInviteSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
});

export type InvitationType = z.infer<typeof invitationTypeSchema>;
export type OrgInviteRole = z.infer<typeof orgInviteRoleSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type CompleteRegistrationDto = z.infer<
  typeof completeRegistrationSchema
>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;
export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type RequestEmailChangeDto = z.infer<typeof requestEmailChangeSchema>;
