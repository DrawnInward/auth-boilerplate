import { z } from "zod";

export const validationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
});

export type ValidationError = z.infer<typeof validationErrorSchema>;

export const validationErrorResponseSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
  errors: z.array(validationErrorSchema),
});

export type ValidationErrorResponse = z.infer<
  typeof validationErrorResponseSchema
>;

export const successResponseSchema = z.object({
  status: z.literal("success"),
  message: z.string(),
  data: z.unknown().optional(),
});

export type SuccessResponse = z.infer<typeof successResponseSchema>;

export const errorResponseSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    status: z.literal("success"),
    data: z.array(itemSchema),
    pagination: z.object({
      total: z.number(),
      limit: z.number(),
      offset: z.number(),
      has_more: z.boolean(),
    }),
  });

export const authResponseSchema = z.object({
  user_id: z.string().uuid().optional(),
  admin_id: z.string().uuid().optional(),
  email: z.string().email(),
  email_verified: z.boolean(),
  is_active: z.boolean(),
  mfa_required: z.boolean().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
