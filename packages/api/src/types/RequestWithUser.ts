import { Request } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
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

// Generic over the route's path parameters. Pass the type inferred from the
// same Zod schema the route validates with — e.g.
// `RequestWithUser<OrganizationParams>` behind
// `validateParams(organizationParamsSchema)` — and `req.params.organizationId`
// is a proven `string` instead of needing an `as string` cast.
//
// The default stays Express's own `ParamsDictionary`, whose values are
// `string | string[]`, so a handler that reads params without declaring their
// shape still fails to compile rather than quietly asserting.
export type RequestWithUser<P = ParamsDictionary> = Request<P> & {
  user?: z.infer<typeof reqUserSchema>;
  organization?: Organization;
  organizationMembership?: OrganizationMember;
  organizationRole?: OrganizationRoleType;
};
