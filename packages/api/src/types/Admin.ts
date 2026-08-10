import { z } from "zod";

export const adminSchema = z.object({
  admin_id: z.string().uuid().optional(),
  email: z.string().email(),
  password_hash: z.string(),
  root: z.boolean().optional(),
  email_verified: z.boolean().optional(),
  deleted_at: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  deactivated_at: z.string().nullable().optional(),
  deactivated_by: z.string().uuid().nullable().optional(),
  mfa_enabled: z.boolean().optional(),
  mfa_secret: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const createAdminSchema = adminSchema.omit({
  admin_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  deactivated_at: true,
  deactivated_by: true,
});

export const updateAdminSchema = adminSchema.partial().omit({
  admin_id: true,
  created_at: true,
  updated_at: true,
});

export const getAdminsOptionsSchema = z.object({
  is_active: z.boolean().optional(),
  email_verified: z.boolean().optional(),
  root: z.boolean().optional(),
});

export type GetAdminsOptions = z.infer<typeof getAdminsOptionsSchema>;

export type Admin = z.infer<typeof adminSchema>;

// See SafeUser: the SAFE_ADMIN_COLUMNS projection shape, compiler-enforced.
export type SafeAdmin = Omit<Admin, "password_hash" | "mfa_secret">;
export type CreateAdminDto = z.infer<typeof createAdminSchema>;
export type UpdateAdminDto = z.infer<typeof updateAdminSchema>;
