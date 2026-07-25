import { z } from "zod";
import {
  authProviderSchema,
  createdThroughSchema,
} from "@auth-boilerplate/shared";

// Defined once in the shared package (mirroring the DB CHECK constraints) and
// re-exported for the API's internal row schemas — never re-typed here.
export { authProviderSchema, createdThroughSchema };

export const userSchema = z.object({
  user_id: z.string().uuid().optional(),
  email: z.string().email(),
  password_hash: z.string().nullable().optional(),
  email_verified: z.boolean().optional(),
  deleted_at: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  deactivated_at: z.string().nullable().optional(),
  deactivated_by: z.string().uuid().nullable().optional(),
  mfa_enabled: z.boolean().optional(),
  mfa_secret: z.string().nullable().optional(),
  google_id: z.string().nullable().optional(),
  auth_provider: authProviderSchema.optional(),
  created_through: createdThroughSchema.optional(),
  can_create_orgs: z.boolean().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const createUserSchema = userSchema
  .omit({
    user_id: true,
    created_at: true,
    updated_at: true,
    deleted_at: true,
    deactivated_at: true,
    deactivated_by: true,
  })
  .extend({
    password: z.string().min(1, "Password is required").optional(),
  });

export const updateUserSchema = userSchema
  .partial()
  .omit({
    user_id: true,
    created_at: true,
    updated_at: true,
    password_hash: true,
  })
  .extend({
    password: z.string().min(1).optional(),
  });

export const loginUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const adminInviteUserSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const getUsersOptionsSchema = z.object({
  is_active: z.boolean().optional(),
  email_verified: z.boolean().optional(),
  deleted_at: z.null().optional(),
});

export const userStatsSchema = z.object({
  total: z.number().int().min(0),
  active: z.number().int().min(0),
  inactive: z.number().int().min(0),
  verified: z.number().int().min(0),
  unverified: z.number().int().min(0),
  deleted: z.number().int().min(0),
});

export type UserStats = z.infer<typeof userStatsSchema>;

// Change password schema
export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "New password must be at least 8 characters"),
});

// Update profile schema
export const updateProfileSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
});

export type User = z.infer<typeof userSchema>;
export type GetUsersOptions = z.infer<typeof getUsersOptionsSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type LoginUserDto = z.infer<typeof loginUserSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type CreatedThrough = z.infer<typeof createdThroughSchema>;
export type AdminInviteUserDto = z.infer<typeof adminInviteUserSchema>;
