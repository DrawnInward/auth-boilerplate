import { z } from "zod";
export const authProviderSchema = z.enum(["local", "google", "both"]);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export const loginUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginUserDto = z.infer<typeof loginUserSchema>;

export const userStatsSchema = z.object({
  total: z.number().int().min(0),
  active: z.number().int().min(0),
  inactive: z.number().int().min(0),
  verified: z.number().int().min(0),
  unverified: z.number().int().min(0),
  deleted: z.number().int().min(0),
});

export type UserStats = z.infer<typeof userStatsSchema>;

export const publicUserSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  email_verified: z.boolean(),
  is_active: z.boolean(),
  mfa_enabled: z.boolean(),
  auth_provider: authProviderSchema,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "New password must be at least 8 characters"),
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
