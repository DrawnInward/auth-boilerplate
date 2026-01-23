import { z } from "zod";

export const userSchema = z.object({
  user_id: z.string().uuid().optional(),
  email: z.string().email(),
  password_hash: z.string().optional(),
  email_verified: z.boolean().optional(),
  deleted_at: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  deactivated_at: z.string().nullable().optional(),
  deactivated_by: z.string().uuid().nullable().optional(),
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

export type User = z.infer<typeof userSchema>;
export type GetUsersOptions = z.infer<typeof getUsersOptionsSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type LoginUserDto = z.infer<typeof loginUserSchema>;
