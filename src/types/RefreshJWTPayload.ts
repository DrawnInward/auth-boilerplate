import { z } from "zod";
export const refreshJwtPayloadSchema = z.object({
  refresh_id: z.string().uuid(),
  role_type: z.string(),
  // JWT standard claims
  exp: z.number().optional(),
  iat: z.number().optional(),
  iss: z.string().optional(),
  sub: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
});

export type RefreshJwtPayload = z.infer<typeof refreshJwtPayloadSchema>;
