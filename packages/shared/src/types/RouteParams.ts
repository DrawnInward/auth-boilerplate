import { z } from "zod";

export const organizationParamsSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID format"),
});

export const organizationMemberParamsSchema = organizationParamsSchema.extend({
  userId: z.string().uuid("Invalid user ID format"),
});

export const organizationInvitationParamsSchema =
  organizationParamsSchema.extend({
    invitationId: z.string().uuid("Invalid invitation ID format"),
  });

export const userParamsSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
});

export const adminParamsSchema = z.object({
  adminId: z.string().uuid("Invalid admin ID format"),
});

export const tokenParamsSchema = z.object({
  token: z.string().min(1, "Token is required"),
});
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
  page: z.coerce.number().min(1).optional(),
});

export const organizationsQuerySchema = paginationQuerySchema.extend({
  owner_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

// A query string carries booleans as text, and z.coerce.boolean() is wrong for
// it: Boolean("false") is true. Only the two literals are accepted.
export const queryBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const usersQuerySchema = paginationQuerySchema.extend({
  is_active: queryBooleanSchema.optional(),
  email_verified: queryBooleanSchema.optional(),
});

export const adminsQuerySchema = usersQuerySchema.extend({
  root: queryBooleanSchema.optional(),
});

export type OrganizationParams = z.infer<typeof organizationParamsSchema>;
export type OrganizationMemberParams = z.infer<
  typeof organizationMemberParamsSchema
>;
export type OrganizationInvitationParams = z.infer<
  typeof organizationInvitationParamsSchema
>;
export type UserParams = z.infer<typeof userParamsSchema>;
export type AdminParams = z.infer<typeof adminParamsSchema>;
export type TokenParams = z.infer<typeof tokenParamsSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type OrganizationsQuery = z.infer<typeof organizationsQuerySchema>;
export type UsersQuery = z.infer<typeof usersQuerySchema>;
export type AdminsQuery = z.infer<typeof adminsQuerySchema>;
