import { z } from "zod";

// Route parameter validation schemas
export const organizationParamsSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID format"),
});

export const organizationMemberParamsSchema = organizationParamsSchema.extend({
  userId: z.string().uuid("Invalid user ID format"),
});

export const userParamsSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
});

// Query parameter validation schemas
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
  page: z.coerce.number().min(1).optional(),
});

export const organizationsQuerySchema = paginationQuerySchema.extend({
  owner_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

// Export types
export type OrganizationParams = z.infer<typeof organizationParamsSchema>;
export type OrganizationMemberParams = z.infer<typeof organizationMemberParamsSchema>;
export type UserParams = z.infer<typeof userParamsSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type OrganizationsQuery = z.infer<typeof organizationsQuerySchema>;
