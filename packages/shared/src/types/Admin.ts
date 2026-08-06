import { z } from "zod";

// Login schema for admin
export const loginAdminSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginAdminDto = z.infer<typeof loginAdminSchema>;

export const adminStatsSchema = z.object({
  total: z.number(),
  active: z.number(),
  inactive: z.number(),
  verified: z.number(),
  unverified: z.number(),
  root_admins: z.number(),
  deleted: z.number(),
});

export type AdminStats = z.infer<typeof adminStatsSchema>;

export const inviteAdminSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type InviteAdminDto = z.infer<typeof inviteAdminSchema>;

export const publicAdminSchema = z.object({
  admin_id: z.string().uuid(),
  email: z.string().email(),
  root: z.boolean(),
  email_verified: z.boolean(),
  is_active: z.boolean(),
  mfa_enabled: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type PublicAdmin = z.infer<typeof publicAdminSchema>;
