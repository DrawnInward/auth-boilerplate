import request from "supertest";
import { randomUUID } from "crypto";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers, testAdmins } from "../../src/database/test-data";

require("dotenv").config({ quiet: true });

// B1: the wrong-role boundary matrix. Every route in the app is classified
// below as public, user-only or admin-only; every protected route is then hit
// with the wrong role's cookie (expect 403) and with no cookie (expect 401).
// A completeness sweep walks the real Express router and fails if a route
// exists that this table doesn't classify — so a new endpoint cannot ship
// without declaring, and therefore testing, its role boundary.

type Access = "public" | "user" | "admin";

interface ClassifiedRoute {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** The prefix the route's router is mounted at (see user.routes/admin.routes). */
  mount: string;
  /** The path registered on that router — exactly as written in the route file. */
  tail: string;
  access: Access;
}

const route = (
  method: ClassifiedRoute["method"],
  mount: string,
  tail: string,
  access: Access,
): ClassifiedRoute => ({ method, mount, tail, access });

const ROUTES: ClassifiedRoute[] = [
  // config
  route("get", "/api/config", "/", "public"),

  // user auth
  route("post", "/api/auth", "/register", "public"),
  route("get", "/api/auth", "/verify/:token", "public"),
  route("post", "/api/auth", "/complete-registration", "public"),
  route("post", "/api/auth", "/forgot-password", "public"),
  route("post", "/api/auth", "/reset-password", "public"),
  route("post", "/api/auth", "/login", "public"),
  route("post", "/api/auth", "/refresh", "public"),
  route("post", "/api/auth", "/logout", "user"),
  route("post", "/api/auth", "/mfa/login-verify", "public"),
  route("post", "/api/auth", "/mfa/login-backup", "public"),
  route("get", "/api/auth", "/me", "user"),
  route("put", "/api/auth", "/change-password", "user"),
  route("put", "/api/auth", "/profile", "user"),
  route("post", "/api/auth", "/request-email-change", "user"),
  route("post", "/api/auth", "/confirm-email-change/:token", "public"),
  route("post", "/api/auth", "/set-password", "user"),

  // user MFA
  route("post", "/api/auth/mfa", "/setup", "user"),
  route("post", "/api/auth/mfa", "/verify-setup", "user"),
  route("post", "/api/auth/mfa", "/verify", "user"),
  route("post", "/api/auth/mfa", "/disable", "user"),
  route("post", "/api/auth/mfa", "/backup/verify", "user"),
  route("post", "/api/auth/mfa", "/backup/regenerate", "user"),
  route("get", "/api/auth/mfa", "/status", "user"),

  // OAuth
  route("get", "/api/oauth", "/google", "public"),
  route("get", "/api/oauth", "/google/callback", "public"),
  route("post", "/api/oauth", "/google/link", "public"),
  route("post", "/api/oauth", "/google/unlink", "user"),

  // organizations
  route("get", "/api/organizations", "/", "user"),
  route("post", "/api/organizations", "/", "user"),
  route("get", "/api/organizations", "/:organizationId", "user"),
  route("put", "/api/organizations", "/:organizationId", "user"),
  route("delete", "/api/organizations", "/:organizationId", "user"),
  route("get", "/api/organizations", "/:organizationId/members", "user"),
  route("post", "/api/organizations", "/:organizationId/members", "user"),
  route(
    "put",
    "/api/organizations",
    "/:organizationId/members/:userId",
    "user",
  ),
  route(
    "delete",
    "/api/organizations",
    "/:organizationId/members/:userId",
    "user",
  ),
  route(
    "post",
    "/api/organizations",
    "/:organizationId/transfer-ownership",
    "user",
  ),
  route("post", "/api/organizations", "/:organizationId/leave", "user"),
  route("post", "/api/organizations", "/:organizationId/invite", "user"),
  route("get", "/api/organizations", "/:organizationId/invitations", "user"),
  route(
    "delete",
    "/api/organizations",
    "/:organizationId/invitations/:invitationId",
    "user",
  ),

  // invitations
  route("get", "/api/invitations", "/:token", "public"),
  route("post", "/api/invitations", "/:token/accept", "public"),

  // admin auth
  route("post", "/api/admin/auth", "/login", "public"),
  route("post", "/api/admin/auth", "/mfa/login-verify", "public"),
  route("post", "/api/admin/auth", "/mfa/login-backup", "public"),
  route("get", "/api/admin/auth", "/me", "admin"),
  route("post", "/api/admin/auth", "/logout", "admin"),

  // admin MFA
  route("post", "/api/admin/auth/mfa", "/setup", "admin"),
  route("post", "/api/admin/auth/mfa", "/verify-setup", "admin"),
  route("post", "/api/admin/auth/mfa", "/verify", "admin"),
  route("post", "/api/admin/auth/mfa", "/disable", "admin"),
  route("post", "/api/admin/auth/mfa", "/backup/verify", "admin"),
  route("post", "/api/admin/auth/mfa", "/backup/regenerate", "admin"),
  route("get", "/api/admin/auth/mfa", "/status", "admin"),

  // admin users
  route("post", "/api/admin/users", "/", "admin"),
  route("get", "/api/admin/users", "/", "admin"),
  route("post", "/api/admin/users", "/reset-password/:userId", "admin"),
  route("get", "/api/admin/users", "/:userId", "admin"),
  route("put", "/api/admin/users", "/:userId", "admin"),
  route("delete", "/api/admin/users", "/:userId", "admin"),
  route("patch", "/api/admin/users", "/:userId/org-permission", "admin"),
  route("post", "/api/admin/users", "/:userId/disable-mfa", "admin"),

  // admin organizations
  route("post", "/api/admin/organizations", "/", "admin"),
  route("get", "/api/admin/organizations", "/", "admin"),
  route("get", "/api/admin/organizations", "/stats", "admin"),
  route("get", "/api/admin/organizations", "/:organizationId", "admin"),
  route("put", "/api/admin/organizations", "/:organizationId", "admin"),
  route("delete", "/api/admin/organizations", "/:organizationId", "admin"),
  route("get", "/api/admin/organizations", "/:organizationId/members", "admin"),
  route(
    "post",
    "/api/admin/organizations",
    "/:organizationId/members",
    "admin",
  ),
  route(
    "put",
    "/api/admin/organizations",
    "/:organizationId/members/:userId",
    "admin",
  ),
  route(
    "delete",
    "/api/admin/organizations",
    "/:organizationId/members/:userId",
    "admin",
  ),
];

/** Concrete request path: params filled with well-formed throwaway values. */
const concretePath = ({ mount, tail }: ClassifiedRoute): string => {
  const full = tail === "/" ? mount : mount + tail;
  return full.replace(/:token\b/g, "0".repeat(64)).replace(/:[^/]+/g, () => {
    return randomUUID();
  });
};

/** Walk the real Express router, collecting `METHOD tail` for every route. */
function collectRegisteredRoutes(stack: any[]): string[] {
  const out: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const methods: string[] = layer.route.methods
        ? Object.keys(layer.route.methods)
        : layer.route.stack.map((l: any) => l.method);
      for (const method of methods) {
        out.push(`${method.toUpperCase()} ${layer.route.path}`);
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      out.push(...collectRegisteredRoutes(layer.handle.stack));
    }
  }
  return out;
}

describe("Role boundary matrix (B1)", () => {
  let userCookies: string[];
  let adminCookies: string[];

  beforeAll(async () => {
    await seed({ usersData: testUsers, adminsData: testAdmins });

    const userLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "Password1" })
      .expect(200);
    userCookies = userLogin.headers["set-cookie"] as unknown as string[];

    const adminLogin = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "root.admin@test.com", password: "Password1" })
      .expect(200);
    adminCookies = adminLogin.headers["set-cookie"] as unknown as string[];
  });

  afterAll(async () => {
    await db.end();
  });

  it("classifies every route the app registers (completeness)", () => {
    const router = (app as any).router ?? (app as any)._router;
    const registered = collectRegisteredRoutes(router.stack).sort();
    const classified = ROUTES.map(
      (r) => `${r.method.toUpperCase()} ${r.tail}`,
    ).sort();

    // Mount prefixes aren't recoverable from Express 5 layers, so the
    // comparison is on router-local paths; a route added anywhere without a
    // matrix entry still breaks the multiset.
    expect(registered).toEqual(classified);
  });

  describe("admin-only routes reject a user cookie", () => {
    const adminRoutes = ROUTES.filter((r) => r.access === "admin");

    it.each(adminRoutes.map((r) => [r.method.toUpperCase(), concretePath(r)]))(
      "%s %s → 403",
      async (method, path) => {
        const agent = request(app);
        const response = await agent[
          method.toLowerCase() as ClassifiedRoute["method"]
        ](path)
          .set("Cookie", userCookies)
          .expect(403);

        expect(response.body.message).toBe("Insufficient permissions");
      },
    );
  });

  describe("user-only routes reject an admin cookie", () => {
    const userRoutes = ROUTES.filter((r) => r.access === "user");

    it.each(userRoutes.map((r) => [r.method.toUpperCase(), concretePath(r)]))(
      "%s %s → 403",
      async (method, path) => {
        const agent = request(app);
        const response = await agent[
          method.toLowerCase() as ClassifiedRoute["method"]
        ](path)
          .set("Cookie", adminCookies)
          .expect(403);

        expect(response.body.message).toBe("Insufficient permissions");
      },
    );
  });

  describe("protected routes reject the unauthenticated", () => {
    const protectedRoutes = ROUTES.filter((r) => r.access !== "public");

    it.each(
      protectedRoutes.map((r) => [r.method.toUpperCase(), concretePath(r)]),
    )("%s %s → 401", async (method, path) => {
      const agent = request(app);
      const response =
        await agent[method.toLowerCase() as ClassifiedRoute["method"]](
          path,
        ).expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });
  });
});
