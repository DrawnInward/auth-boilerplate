import { Request } from "express";
import { z } from "zod";
import {
  Organization,
  OrganizationMember,
  OrganizationRoleType,
} from "@auth-boilerplate/shared";

export const reqUserSchema = z.object({
  role_id: z.string().uuid(),
  role_type: z.string(),
});

export type RequestWithUser = Request & {
  user?: z.infer<typeof reqUserSchema>;
  organization?: Organization;
  organizationMembership?: OrganizationMember;
  organizationRole?: OrganizationRoleType;
};
