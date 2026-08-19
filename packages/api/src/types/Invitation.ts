import { z } from "zod";
import {
  invitationSchema,
  invitationTypeSchema,
  orgInviteRoleSchema,
} from "@auth-boilerplate/shared";

// Internal insert DTO for the invitations model. The invitation row schema and
// every FE-visible invitation schema live once in the shared package.
export const createInvitationSchema = z.object({
  email: z.string().email(),
  type: invitationTypeSchema,
  organization_id: z.string().uuid().nullable().optional(),
  role: orgInviteRoleSchema.nullable().optional(),
  invited_by: z.string().uuid().nullable().optional(),
  new_email: z.string().email().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
});

export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;

// The DB row: the shared contract plus the credential digest. Models return
// this; anything FE-bound types against the shared Invitation, so returning
// a raw row through a contract is a compile error (the password_hash rule).
export const invitationRowSchema = invitationSchema.extend({
  token_hash: z.string().optional(),
});

export type InvitationRow = z.infer<typeof invitationRowSchema>;
