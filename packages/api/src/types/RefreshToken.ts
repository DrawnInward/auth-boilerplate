import { z } from "zod";

export const refreshTokenSchema = z.object({
  refresh_id: z.string().uuid().optional(),
  role_id: z.string().uuid(),
  role_type: z.string(),
  token_hash: z.string().optional(),
  expiration_time: z.string().optional(),
  issued_time: z.string().optional(),
  last_used_time: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  used_at: z.string().nullable().optional(),
  replaced_by: z.string().uuid().nullable().optional(),
});

export const createRefreshTokenSchema = refreshTokenSchema.pick({
  role_id: true,
  role_type: true,
});

export const updateRefreshTokenSchema = refreshTokenSchema
  .partial()
  .omit({ refresh_id: true });

export type RefreshToken = z.infer<typeof refreshTokenSchema>;
export type CreateRefreshTokenDto = z.infer<typeof createRefreshTokenSchema>;
export type UpdateRefreshTokenDto = z.infer<typeof updateRefreshTokenSchema>;
