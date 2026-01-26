import { z } from "zod";

export const googleLinkSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type GoogleLinkDto = z.infer<typeof googleLinkSchema>;

export const setPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SetPasswordDto = z.infer<typeof setPasswordSchema>;
