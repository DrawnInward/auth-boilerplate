import { z } from "zod";

export const tokenCookieOptionsSchema = z.object({
  isSecure: z.boolean().optional(),
  allowedOrigin: z.string().optional(),
});

export type TokenCookieOptions = z.infer<typeof tokenCookieOptionsSchema>;
