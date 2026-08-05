import { z } from "zod";

// Single source for org role vocabularies. Zod enums and the type derive from
// the arrays; the OrganizationRole map is kept for compatibility.
export const ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "member",
  "viewer",
] as const;
export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES);
export type OrganizationRoleType = (typeof ORGANIZATION_ROLES)[number];

// Roles that can be granted to others — owner is never assignable.
export const ASSIGNABLE_ORGANIZATION_ROLES = [
  "admin",
  "member",
  "viewer",
] as const;
export const assignableOrganizationRoleSchema = z.enum(
  ASSIGNABLE_ORGANIZATION_ROLES,
);

export const OrganizationRole = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  owner_id: z.string().uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  // Null on everything the API returns except the delete response itself —
  // every read filters soft-deleted organizations out at the model layer.
  deleted_at: z.date().nullable().optional(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const organizationMemberSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: organizationRoleSchema,
  invited_by: z.string().uuid().nullable(),
  joined_at: z.date().optional(),
  created_at: z.date().optional(),
});

export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const createOrganizationDtoSchema = z.object({
  name: z
    .string()
    .min(1, "Organization name is required")
    .max(255, "Organization name must be 255 characters or less")
    .trim(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100, "Slug must be 100 characters or less")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    )
    .optional(), // Will be auto-generated from name if not provided
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationDtoSchema>;

export const updateOrganizationDtoSchema = z
  .object({
    name: z
      .string()
      .min(1, "Organization name cannot be empty")
      .max(255, "Organization name must be 255 characters or less")
      .trim()
      .optional(),
    slug: z
      .string()
      .min(1, "Slug cannot be empty")
      .max(100, "Slug must be 100 characters or less")
      .regex(
        /^[a-z0-9-]+$/,
        "Slug can only contain lowercase letters, numbers, and hyphens",
      )
      .optional(),
  })
  .strict();

export type UpdateOrganizationDto = z.infer<typeof updateOrganizationDtoSchema>;

export const addOrganizationMemberDtoSchema = z.object({
  user_id: z.string().uuid("User ID must be a valid UUID"),
  role: organizationRoleSchema.default("member").optional(),
});

export type AddOrganizationMemberDto = z.infer<
  typeof addOrganizationMemberDtoSchema
>;

export const updateMemberRoleDtoSchema = z.object({
  role: assignableOrganizationRoleSchema,
});

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleDtoSchema>;

export const getOrganizationsOptionsSchema = z
  .object({
    owner_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(), // Filter by membership
  })
  .strict();

export type GetOrganizationsOptions = z.infer<
  typeof getOrganizationsOptionsSchema
>;

export const organizationStatsSchema = z.object({
  total: z.number().nonnegative(),
  total_members: z.number().nonnegative(),
  created_last_30_days: z.number().nonnegative(),
});

export type OrganizationStats = z.infer<typeof organizationStatsSchema>;

export const organizationWithMemberCountSchema = organizationSchema.extend({
  member_count: z.number().nonnegative(),
});

export type OrganizationWithMemberCount = z.infer<
  typeof organizationWithMemberCountSchema
>;

export const organizationWithRoleSchema = organizationSchema.extend({
  role: organizationRoleSchema,
});

export type OrganizationWithRole = z.infer<typeof organizationWithRoleSchema>;

export const paginationOptionsSchema = z
  .object({
    limit: z.number().positive().max(1000).optional(),
    offset: z.number().nonnegative().optional(),
  })
  .strict();

export type PaginationOptions = z.infer<typeof paginationOptionsSchema>;

export type ValidatedCreateOrganizationRequest = {
  body: CreateOrganizationDto;
};

export type ValidatedUpdateOrganizationRequest = {
  body: UpdateOrganizationDto;
  params: { id: string };
};

export type ValidatedAddMemberRequest = {
  body: AddOrganizationMemberDto;
  params: { organizationId: string };
};

export type ValidatedUpdateMemberRoleRequest = {
  body: UpdateMemberRoleDto;
  params: { organizationId: string; userId: string };
};
