// Default MSW handlers: the HTTP boundary is the only thing tests mock, so
// hooks, React Query and the api client all run for real.
//
// Request bodies are parsed with the same shared Zod schemas the API validates
// with. A handler that rejects a payload fails the test with a 400, so a
// contract drift between the two packages surfaces here instead of in
// production.

import { http, HttpResponse } from "msw";
import {
  createOrganizationDtoSchema,
  updateMemberRoleDtoSchema,
  inviteMemberSchema,
} from "@auth-boilerplate/shared";
import type { PublicUser } from "@auth-boilerplate/shared";
import type { ZodTypeAny } from "zod";

// Matches api/client.ts's default when VITE_API_URL is unset.
export const API_BASE = "http://localhost:3000/api";

export const url = (path: string) => `${API_BASE}${path}`;

const success = (data: unknown, message = "OK") =>
  HttpResponse.json({ status: "success", message, data });

// Mirrors the API's validation middleware: a bad body is a 400 with the same
// envelope, never a thrown handler.
const parseBody = async <T extends ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> => {
  const result = schema.safeParse(await request.json());
  if (result.success) return { ok: true, data: result.data };

  return {
    ok: false,
    response: HttpResponse.json(
      {
        status: "error",
        message: "Request body validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join(".") || "root",
          message: issue.message,
          code: issue.code,
        })),
      },
      { status: 400 },
    ),
  };
};

export const ORG_ID = "11111111-1111-4111-8111-111111111111";
export const OWNER_ID = "22222222-2222-4222-8222-222222222222";
export const MEMBER_ID = "33333333-3333-4333-8333-333333333333";

const asPublicUser = (user_id: string, email: string): PublicUser => ({
  user_id,
  email,
  email_verified: true,
  is_active: true,
  mfa_enabled: false,
  auth_provider: "local",
});

export const testUsers = {
  owner: asPublicUser(OWNER_ID, "owner@example.com"),
  member: asPublicUser(MEMBER_ID, "member@example.com"),
};

// Who /auth/me reports. Tests that need a different identity — or an
// unauthenticated one — override this handler via `server.use(signedInAs(...))`.
export const signedInAs = (user: PublicUser | null) =>
  http.get(url("/auth/me"), () =>
    user
      ? success(user)
      : HttpResponse.json(
          { status: "error", message: "Unauthorized" },
          { status: 401 },
        ),
  );

export const testOrganization = {
  id: ORG_ID,
  name: "Acme Corp",
  slug: "acme-corp",
  owner_id: OWNER_ID,
  role: "owner" as const,
};

export const testMembers = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: OWNER_ID,
    email: "owner@example.com",
    role: "owner" as const,
    joined_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    user_id: MEMBER_ID,
    email: "member@example.com",
    role: "member" as const,
    joined_at: "2026-01-02T00:00:00.000Z",
  },
];

export const handlers = [
  signedInAs(testUsers.owner),

  http.get(url("/organizations"), () => success([testOrganization])),

  http.get(url(`/organizations/${ORG_ID}`), () => success(testOrganization)),

  http.post(url("/organizations"), async ({ request }) => {
    const body = await parseBody(request, createOrganizationDtoSchema);
    if (!body.ok) return body.response;

    return HttpResponse.json(
      {
        status: "success",
        message: "Organization created",
        data: { ...testOrganization, ...(body.data as object) },
      },
      { status: 201 },
    );
  }),

  http.get(url(`/organizations/${ORG_ID}/members`), () => success(testMembers)),

  http.put(
    url(`/organizations/${ORG_ID}/members/:userId`),
    async ({ request }) => {
      const body = await parseBody(request, updateMemberRoleDtoSchema);
      if (!body.ok) return body.response;
      return success(null, "Member role updated");
    },
  ),

  http.delete(url(`/organizations/${ORG_ID}/members/:userId`), () =>
    success(null, "Member removed"),
  ),

  http.get(url(`/organizations/${ORG_ID}/invitations`), () => success([])),

  http.post(url(`/organizations/${ORG_ID}/invite`), async ({ request }) => {
    const body = await parseBody(request, inviteMemberSchema);
    if (!body.ok) return body.response;
    return success(null, "Invitation sent");
  }),
];
