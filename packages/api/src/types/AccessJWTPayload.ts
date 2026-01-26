import { z } from "zod";

export const accessJwtPayloadSchema = z.object({
  role_id: z.string().uuid(),
  role_type: z.string(),
  // JWT standard claims
  exp: z.number().optional(),
  iat: z.number().optional(),
  iss: z.string().optional(),
  sub: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
});

export type AccessJwtPayload = z.infer<typeof accessJwtPayloadSchema>;
