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
  acceptInviteSchema,
  googleLinkSchema,
} from "@auth-boilerplate/shared";
import type {
  PublicUser,
  PublicAdmin,
  PublicInvitation,
} from "@auth-boilerplate/shared";
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

export const INVITE_TOKEN = "a".repeat(64);

// A new-user org invitation. Tests needing an existing-user or broken
// invitation override the GET handler via `server.use(invitationIs(...))`.
export const testInvitation: PublicInvitation = {
  email: "invitee@example.com",
  type: "org_invite",
  is_existing_user: false,
  organization_id: ORG_ID,
  organization_name: "Acme Corp",
  role: "member",
};

export const ROOT_ADMIN_ID = "44444444-4444-4444-8444-444444444444";
export const REGULAR_ADMIN_ID = "55555555-5555-4555-8555-555555555555";

const asPublicAdmin = (
  admin_id: string,
  email: string,
  root: boolean,
): PublicAdmin => ({
  admin_id,
  email,
  root,
  email_verified: true,
  is_active: true,
  mfa_enabled: false,
});

export const testAdmins = {
  root: asPublicAdmin(ROOT_ADMIN_ID, "root@example.com", true),
  regular: asPublicAdmin(REGULAR_ADMIN_ID, "admin@example.com", false),
};

// Who /admin/auth/me reports; override per test via
// `server.use(adminSignedInAs(...))`.
export const adminSignedInAs = (admin: PublicAdmin | null) =>
  http.get(url("/admin/auth/me"), () =>
    admin
      ? success(admin)
      : HttpResponse.json(
          { status: "error", message: "Unauthorized" },
          { status: 401 },
        ),
  );

export const OAUTH_CODE = "test-oauth-code";

// What the one-shot code exchange answers. Tests drive the other outcomes —
// or a rejection (null → 401, e.g. a state mismatch) — via
// `server.use(googleCallbackIs(...))`.
export const googleCallbackIs = (
  data:
    | { mfa_required: true }
    | { needs_linking: true; email: string }
    | { user_id: string; email: string; is_active: boolean }
    | null,
) =>
  http.get(url("/oauth/google/callback"), () =>
    data
      ? success(data)
      : HttpResponse.json(
          { status: "error", message: "Invalid state parameter" },
          { status: 401 },
        ),
  );

export const invitationIs = (invitation: PublicInvitation | null) =>
  http.get(url(`/invitations/${INVITE_TOKEN}`), () =>
    invitation
      ? success(invitation)
      : HttpResponse.json(
          { status: "error", message: "Invalid or expired invitation" },
          { status: 404 },
        ),
  );

export const handlers = [
  signedInAs(testUsers.owner),

  // The api client retries a 401 after one refresh attempt; refusing here by
  // default keeps signed-out scenarios deterministic instead of tripping the
  // unhandled-request error.
  http.post(url("/auth/refresh"), () =>
    HttpResponse.json(
      { status: "error", message: "Credentials missing" },
      { status: 401 },
    ),
  ),

  adminSignedInAs(testAdmins.root),

  http.get(url("/admin/admins"), () =>
    success([testAdmins.root, testAdmins.regular]),
  ),

  http.get(url("/config"), () =>
    success({ oauth: { google: true }, registration: { enabled: true } }),
  ),

  http.get(url("/oauth/google"), () =>
    success({ url: "https://accounts.google.com/o/oauth2/auth?mock" }),
  ),

  googleCallbackIs({
    user_id: OWNER_ID,
    email: "owner@example.com",
    is_active: true,
  }),

  http.post(url("/oauth/google/link"), async ({ request }) => {
    const body = await parseBody(request, googleLinkSchema);
    if (!body.ok) return body.response;
    return success({ user_id: OWNER_ID }, "Google account linked");
  }),

  http.post(url("/oauth/google/unlink"), () =>
    success(null, "Google account unlinked"),
  ),

  invitationIs(testInvitation),

  http.post(url(`/invitations/${INVITE_TOKEN}/accept`), async ({ request }) => {
    const body = await parseBody(request, acceptInviteSchema);
    if (!body.ok) return body.response;
    return success(null, "Invitation accepted");
  }),

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
