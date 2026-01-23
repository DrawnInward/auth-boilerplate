import { z } from "zod";

export const validationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
});

export const validationErrorResponseSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
  errors: z.array(validationErrorSchema),
});

export type ValidationError = z.infer<typeof validationErrorSchema>;
export type ValidationErrorResponse = z.infer<
  typeof validationErrorResponseSchema
>;

export const successResponseSchema = z.object({
  status: z.literal("success"),
  message: z.string(),
  data: z.unknown().optional(),
});

export type SuccessResponse = z.infer<typeof successResponseSchema>;
