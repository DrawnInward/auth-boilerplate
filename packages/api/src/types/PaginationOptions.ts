import { z } from "zod";

export const paginationOptionsSchema = z.object({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

export type PaginationOptions = z.infer<typeof paginationOptionsSchema>;
