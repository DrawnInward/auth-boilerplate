import { z } from "zod";

// Organization roles enum
export const OrganizationRole = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

export type OrganizationRoleType =
  (typeof OrganizationRole)[keyof typeof OrganizationRole];

// Organization schema
export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  owner_id: z.string().uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type Organization = z.infer<typeof organizationSchema>;

// Organization Member schema
export const organizationMemberSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
  invited_by: z.string().uuid().nullable(),
  joined_at: z.date().optional(),
  created_at: z.date().optional(),
});

export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

// Create Organization DTO
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
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .optional(), // Will be auto-generated from name if not provided
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationDtoSchema>;

// Update Organization DTO
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
        "Slug can only contain lowercase letters, numbers, and hyphens"
      )
      .optional(),
  })
  .strict();

export type UpdateOrganizationDto = z.infer<typeof updateOrganizationDtoSchema>;

// Add Member DTO
export const addOrganizationMemberDtoSchema = z.object({
  user_id: z.string().uuid("User ID must be a valid UUID"),
  role: z
    .enum(["owner", "admin", "member", "viewer"])
    .default("member")
    .optional(),
});

export type AddOrganizationMemberDto = z.infer<
  typeof addOrganizationMemberDtoSchema
>;

// Update Member Role DTO
export const updateMemberRoleDtoSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleDtoSchema>;

// Get Organizations Options (for filtering)
export const getOrganizationsOptionsSchema = z
  .object({
    owner_id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(), // Filter by membership
  })
  .strict();

export type GetOrganizationsOptions = z.infer<
  typeof getOrganizationsOptionsSchema
>;

// Organization Stats schema
export const organizationStatsSchema = z.object({
  total: z.number().nonnegative(),
  total_members: z.number().nonnegative(),
  created_last_30_days: z.number().nonnegative(),
});

export type OrganizationStats = z.infer<typeof organizationStatsSchema>;

// Organization with member count
export const organizationWithMemberCountSchema = organizationSchema.extend({
  member_count: z.number().nonnegative(),
});

export type OrganizationWithMemberCount = z.infer<
  typeof organizationWithMemberCountSchema
>;

// Organization with user's role (for user-facing queries)
export const organizationWithRoleSchema = organizationSchema.extend({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export type OrganizationWithRole = z.infer<typeof organizationWithRoleSchema>;

// Pagination Options schema
export const paginationOptionsSchema = z
  .object({
    limit: z.number().positive().max(1000).optional(),
    offset: z.number().nonnegative().optional(),
  })
  .strict();

export type PaginationOptions = z.infer<typeof paginationOptionsSchema>;

// Request validation types
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
