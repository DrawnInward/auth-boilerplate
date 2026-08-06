import { z } from "zod";
import {
  authProviderSchema,
  createdThroughSchema,
} from "@auth-boilerplate/shared";

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

// Internal row-patch shape for modifyUser — wider than the HTTP contract
// (the shared updateUserSchema); the model's allow-list is the write authority.
export const userPatchSchema = userSchema.partial().omit({
  user_id: true,
  created_at: true,
  updated_at: true,
  password_hash: true,
});

export const getUsersOptionsSchema = z.object({
  is_active: z.boolean().optional(),
  email_verified: z.boolean().optional(),
  deleted_at: z.null().optional(),
});

export type User = z.infer<typeof userSchema>;
export type GetUsersOptions = z.infer<typeof getUsersOptionsSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UserPatchDto = z.infer<typeof userPatchSchema>;
