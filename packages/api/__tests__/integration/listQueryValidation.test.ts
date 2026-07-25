import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import {
  testAdmins,
  testUsers,
  testOrganizations,
  testOrganizationMembers,
} from "../../src/database/test-data";
import { getOrganizationUuid } from "../../src/database/test-data/testUuids";
import { loginAs, loginAsAdmin } from "../helpers/loginAs";

// List endpoints take limit/offset from the query string. Before these were
// validated, the values reached SQL as whatever the client sent: `?limit=-5`
// produced `LIMIT -5`, which Postgres rejects, so the endpoint answered 500.
// The shared pagination schema now coerces and bounds them at the edge.
describe("List endpoint query validation", () => {
  let userCookies: string;
  let adminCookies: string;

  beforeAll(async () => {
    await seed({
      adminsData: testAdmins,
      usersData: testUsers,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
    });

    userCookies = await loginAs("test@example.com");
    adminCookies = await loginAsAdmin("root.admin@test.com");
  });

  afterAll(async () => {
    await db.end();
  });

  const orgId = () => getOrganizationUuid(1);

  // Every paginated endpoint, with the credentials it needs.
  const endpoints = () =>
    [
      ["GET /api/organizations", "/api/organizations", () => userCookies],
      [
        "GET /api/organizations/:id/members",
        `/api/organizations/${orgId()}/members`,
        () => userCookies,
      ],
      [
        "GET /api/organizations/:id/invitations",
        `/api/organizations/${orgId()}/invitations`,
        () => userCookies,
      ],
      ["GET /api/admin/users", "/api/admin/users", () => adminCookies],
      [
        "GET /api/admin/organizations",
        "/api/admin/organizations",
        () => adminCookies,
      ],
      [
        "GET /api/admin/organizations/:id/members",
        `/api/admin/organizations/${orgId()}/members`,
        () => adminCookies,
      ],
    ] as [string, string, () => string][];

  describe.each(endpoints())("%s", (_name, path, cookies) => {
    it("accepts a valid limit", async () => {
      const agent = request(app);
      const response = await agent
        .get(`${path}?limit=2`)
        .set("Cookie", cookies());

      expect(response.status).toBe(200);
    });

    it.each([
      ["a negative limit", "limit=-5"],
      ["a zero limit", "limit=0"],
      ["a non-numeric limit", "limit=abc"],
      ["a limit above the maximum", "limit=101"],
      ["a negative offset", "offset=-1"],
      ["a non-numeric offset", "offset=abc"],
    ])("rejects %s with 400", async (_case, query) => {
      const agent = request(app);
      const response = await agent
        .get(`${path}?${query}`)
        .set("Cookie", cookies());

      expect(response.status).toBe(400);
      expect(response.body.status).toBe("error");
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe("coercion", () => {
    it("applies the limit as a number, not a string", async () => {
      const agent = request(app);
      const all = await agent
        .get("/api/admin/users")
        .set("Cookie", adminCookies);
      const limited = await agent
        .get("/api/admin/users?limit=1")
        .set("Cookie", adminCookies);

      expect(all.body.data.length).toBeGreaterThan(1);
      expect(limited.body.data).toHaveLength(1);
    });

    it("treats offset=0 as the start of the list", async () => {
      const agent = request(app);
      const withoutOffset = await agent
        .get("/api/admin/users?limit=2")
        .set("Cookie", adminCookies);
      const withZeroOffset = await agent
        .get("/api/admin/users?limit=2&offset=0")
        .set("Cookie", adminCookies);

      expect(withZeroOffset.body.data).toEqual(withoutOffset.body.data);
    });

    it("offsets past the first page", async () => {
      const agent = request(app);
      const firstPage = await agent
        .get("/api/admin/users?limit=1")
        .set("Cookie", adminCookies);
      const secondPage = await agent
        .get("/api/admin/users?limit=1&offset=1")
        .set("Cookie", adminCookies);

      expect(secondPage.body.data[0].user_id).not.toBe(
        firstPage.body.data[0].user_id,
      );
    });
  });

  describe("boolean filters", () => {
    it.each(["true", "false"])("accepts is_active=%s", async (value) => {
      const agent = request(app);
      const response = await agent
        .get(`/api/admin/users?is_active=${value}`)
        .set("Cookie", adminCookies);

      expect(response.status).toBe(200);
    });

    // "yes" used to be read as false, silently filtering the opposite way.
    it.each(["yes", "1", ""])(
      "rejects a non-boolean is_active=%s with 400",
      async (value) => {
        const agent = request(app);
        const response = await agent
          .get(`/api/admin/users?is_active=${value}`)
          .set("Cookie", adminCookies);

        expect(response.status).toBe(400);
      },
    );

    it("actually filters on the coerced boolean", async () => {
      const agent = request(app);
      const active = await agent
        .get("/api/admin/users?is_active=true")
        .set("Cookie", adminCookies);
      const inactive = await agent
        .get("/api/admin/users?is_active=false")
        .set("Cookie", adminCookies);

      expect(
        active.body.data.every((u: { is_active: boolean }) => u.is_active),
      ).toBe(true);
      expect(
        inactive.body.data.every((u: { is_active: boolean }) => !u.is_active),
      ).toBe(true);
    });
  });

  it("still rejects an unauthenticated request before validating", async () => {
    const response = await request(app).get("/api/organizations?limit=-5");

    expect(response.status).toBe(401);
  });
});
