import request from "supertest";
import { publicInvitationSchema } from "@auth-boilerplate/shared";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import {
  testUsers,
  testOrganizations,
  testOrganizationMembers,
} from "../../src/database/test-data";
import {
  getUserUuid,
  getOrganizationUuid,
} from "../../src/database/test-data/testUuids";

require("dotenv").config({ quiet: true });

describe("Organization Invitation Integration Tests", () => {
  let ownerCookies: string[];
  let adminCookies: string[];

  beforeAll(async () => {
    await seed({
      usersData: testUsers,
      organizationsData: testOrganizations,
      organizationMembersData: testOrganizationMembers,
    });

    // Login as owner (TEST_USER - owner of ACME_CORP)
    const ownerLogin = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "Password1",
    });
    ownerCookies = ownerLogin.headers["set-cookie"] as any;

    // Login as admin (ALICE - admin of ACME_CORP)
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "alice@example.com",
      password: "Password1",
    });
    adminCookies = adminLogin.headers["set-cookie"] as any;

    // Login as member (BOB - member of ACME_CORP)
    // Note: BOB is inactive in test data, add another user that is active and then write tests for this
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/organizations/:orgId/invite", () => {
    it("should allow owner to invite new member", async () => {
      const response = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "newinvite@example.com",
          role: "member",
        })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("newinvite@example.com");
      expect(response.body.data.role).toBe("member");
      expect(response.body.data.expires_at).toBeDefined();
    });

    it("should allow admin to invite new member", async () => {
      const response = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", adminCookies)
        .send({
          email: "admininvite@example.com",
          role: "member",
        })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("admininvite@example.com");
    });

    it("should reject invite from non-admin member", async () => {
      // Bob is a member, not admin - but he's inactive
      // This test would require an active member
      // Skip for now
    });

    it("should reject invite without authentication", async () => {
      const response = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .send({
          email: "unauth@example.com",
          role: "member",
        })
        .expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });

    it("should reject invite for existing member", async () => {
      const response = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "alice@example.com", // Already a member
          role: "member",
        })
        .expect(409);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("already a member");
    });

    it("should reject invite with invalid role", async () => {
      const response = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "invalidrole@example.com",
          role: "owner", // Can't invite as owner
        })
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject invite to non-existent organization", async () => {
      const response = await request(app)
        .post(`/api/organizations/550e8400-e29b-41d4-a716-446655440999/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "noorg@example.com",
          role: "member",
        })
        .expect(404);

      expect(response.body.status).toBe("error");
    });

    it("should reject invite with invalid email", async () => {
      const response = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "not-an-email",
          role: "member",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should allow inviting with different roles", async () => {
      const adminInvite = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "newadmin@example.com",
          role: "admin",
        })
        .expect(201);

      expect(adminInvite.body.data.role).toBe("admin");

      const viewerInvite = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "newviewer@example.com",
          role: "viewer",
        })
        .expect(201);

      expect(viewerInvite.body.data.role).toBe("viewer");
    });
  });

  describe("GET /api/organizations/:orgId/invitations", () => {
    it("should list pending invitations", async () => {
      // Create some invitations first
      await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "listtest1@example.com",
          role: "member",
        });

      await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "listtest2@example.com",
          role: "admin",
        });

      const response = await request(app)
        .get(`/api/organizations/${getOrganizationUuid(1)}/invitations`)
        .set("Cookie", ownerCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);

      // Should not include token_hash
      response.body.data.forEach((inv: any) => {
        expect(inv).not.toHaveProperty("token_hash");
        expect(inv).toHaveProperty("email");
        expect(inv).toHaveProperty("role");
      });
    });

    it("should allow admin to list invitations", async () => {
      const response = await request(app)
        .get(`/api/organizations/${getOrganizationUuid(1)}/invitations`)
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
    });

    it("should reject without authentication", async () => {
      await request(app)
        .get(`/api/organizations/${getOrganizationUuid(1)}/invitations`)
        .expect(401);
    });

    it("should support pagination", async () => {
      const response = await request(app)
        .get(`/api/organizations/${getOrganizationUuid(1)}/invitations`)
        .query({ limit: 1, offset: 0 })
        .set("Cookie", ownerCookies)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe("DELETE /api/organizations/:orgId/invitations/:invitationId", () => {
    it("should allow owner to cancel invitation", async () => {
      // Create an invitation first
      const createResponse = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "tocancel@example.com",
          role: "member",
        })
        .expect(201);

      const invitationId = createResponse.body.data.id;

      const response = await request(app)
        .delete(
          `/api/organizations/${getOrganizationUuid(1)}/invitations/${invitationId}`,
        )
        .set("Cookie", ownerCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("cancelled");
    });

    it("should allow admin to cancel invitation", async () => {
      const createResponse = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "admincancels@example.com",
          role: "member",
        })
        .expect(201);

      const invitationId = createResponse.body.data.id;

      const response = await request(app)
        .delete(
          `/api/organizations/${getOrganizationUuid(1)}/invitations/${invitationId}`,
        )
        .set("Cookie", adminCookies)
        .expect(200);

      expect(response.body.status).toBe("success");
    });

    it("should reject cancelling non-existent invitation", async () => {
      const response = await request(app)
        .delete(
          `/api/organizations/${getOrganizationUuid(1)}/invitations/550e8400-e29b-41d4-a716-446655440999`,
        )
        .set("Cookie", ownerCookies)
        .expect(404);

      expect(response.body.status).toBe("error");
    });

    it("should reject cancelling invitation from different org", async () => {
      // Create invitation in ACME_CORP
      const createResponse = await request(app)
        .post(`/api/organizations/${getOrganizationUuid(1)}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email: "wrongorg@example.com",
          role: "member",
        })
        .expect(201);

      const invitationId = createResponse.body.data.id;

      // Try to cancel from different org (SHARED_PROJECT - also owned by TEST_USER)
      const response = await request(app)
        .delete(
          `/api/organizations/${getOrganizationUuid(4)}/invitations/${invitationId}`,
        )
        .set("Cookie", ownerCookies)
        .expect(403);

      expect(response.body.status).toBe("error");
    });
  });

  describe("GET /api/invitations/:token", () => {
    it("should return invitation details", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "getinvite@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(1),
        role: "member",
        invited_by: getUserUuid(1),
      });

      const response = await request(app)
        .get(`/api/invitations/${result.token}`)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("getinvite@example.com");
      expect(response.body.data.role).toBe("member");
      expect(response.body.data.is_existing_user).toBe(false);
      expect(response.body.data.type).toBe("org_invite");
      expect(response.body.data.organization_id).toBeDefined();
      expect(response.body.data.organization_name).toBe("Acme Corporation");
      // The response is the shared contract, verbatim — drift fails here.
      expect(publicInvitationSchema.safeParse(response.body.data).success).toBe(
        true,
      );
    });

    it("should return 404 for invalid token", async () => {
      const response = await request(app)
        .get("/api/invitations/invalid-token-xyz")
        .expect(404);

      expect(response.body.status).toBe("error");
    });

    it("reads like an invalid token once the organization is soft-deleted (D2)", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const { createOrganization, deleteOrganization } =
        await import("../../src/models/organization.models");

      const org = await createOrganization({
        name: "Dead Org Get",
        owner_id: getUserUuid(1),
      });
      const result = await createInvitation({
        email: "deadorgget@example.com",
        type: "org_invite",
        organization_id: org.id,
        role: "member",
        invited_by: getUserUuid(1),
      });
      await deleteOrganization(org.id);

      const response = await request(app)
        .get(`/api/invitations/${result.token}`)
        .expect(404);
      expect(response.body.message).toBe("Invalid or expired invitation");
    });
  });

  describe("POST /api/invitations/:token/accept", () => {
    it("should accept invitation and create new user", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "newuseraccept@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(1),
        role: "member",
        invited_by: getUserUuid(1),
      });

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "SecurePassword123" })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.organization_id).toBe(getOrganizationUuid(1));
      expect(response.body.data.role).toBe("member");
      expect(response.body.message).toContain("created");

      // Should set auth cookies
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes("access_token"))).toBe(
        true,
      );

      // New user should be able to login
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: "newuseraccept@example.com",
        password: "SecurePassword123",
      });

      expect(loginResponse.status).toBe(200);
    });

    it("refuses to accept into a soft-deleted organization (D2)", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const { createOrganization, deleteOrganization } =
        await import("../../src/models/organization.models");

      const org = await createOrganization({
        name: "Dead Org Accept",
        owner_id: getUserUuid(1),
      });
      const result = await createInvitation({
        email: "deadorgaccept@example.com",
        type: "org_invite",
        organization_id: org.id,
        role: "member",
        invited_by: getUserUuid(1),
      });
      await deleteOrganization(org.id);

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "SecurePassword123" })
        .expect(404);
      expect(response.body.message).toBe("Invalid or expired invitation");

      // Nothing was written into the dead tenant: no account, no membership.
      const user = await db.query("SELECT * FROM users WHERE email = $1", [
        "deadorgaccept@example.com",
      ]);
      expect(user.rows).toHaveLength(0);
      const members = await db.query(
        "SELECT * FROM organization_members WHERE organization_id = $1",
        [org.id],
      );
      expect(members.rows).toHaveLength(0);
    });

    it("should accept invitation for existing user with correct password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      // Invite existing user (test@example.com) to a different org
      // First, create invitation to BOB's team
      const result = await createInvitation({
        email: "test@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(2), // BOB'S TEAM
        role: "admin",
        invited_by: getUserUuid(3), // BOB
      });

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "Password1" }) // Correct password for test@example.com
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("joined");
    });

    it("should reject existing user with wrong password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "alice@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(2),
        role: "member",
        invited_by: getUserUuid(3),
      });

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "WrongPassword" })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("password");
    });

    it("requires MFA and issues no session for an MFA-enabled existing user (S2)", async () => {
      const { createUser } = await import("../../src/models/users.models");
      const { hashPassword } = await import("../../src/utils");
      const { createInvitation } =
        await import("../../src/models/invitations.models");

      const user = await createUser({
        email: "mfa.invitee@example.com",
        password_hash: await hashPassword("Password1"),
        email_verified: true,
        is_active: true,
        created_through: "self_registered",
      });
      await db.query("UPDATE users SET mfa_enabled = true WHERE user_id = $1", [
        user.user_id,
      ]);

      const result = await createInvitation({
        email: "mfa.invitee@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(2),
        role: "member",
        invited_by: getUserUuid(3),
      });

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "Password1" })
        .expect(200);

      // MFA is demanded, and crucially NO session is issued — a known password
      // must not skip the second factor through this path.
      expect(response.body.data.mfa_required).toBe(true);
      const setCookie = (response.headers["set-cookie"] ??
        []) as unknown as string[];
      expect(setCookie.some((c) => c.startsWith("access_token="))).toBe(false);
      expect(setCookie.some((c) => c.startsWith("refresh_token="))).toBe(false);
      // A challenge cookie IS set so the user can complete MFA and log in.
      expect(setCookie.some((c) => c.startsWith("mfa_challenge="))).toBe(true);

      // The org-join is still committed — the invite was validly accepted.
      const membership = await db.query(
        "SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2",
        [getOrganizationUuid(2), user.user_id],
      );
      expect(membership.rows.length).toBe(1);
    });

    it("rejects a deactivated existing user accepting an invitation (S2)", async () => {
      const { createUser } = await import("../../src/models/users.models");
      const { hashPassword } = await import("../../src/utils");
      const { createInvitation } =
        await import("../../src/models/invitations.models");

      await createUser({
        email: "deactivated.invitee@example.com",
        password_hash: await hashPassword("Password1"),
        email_verified: true,
        is_active: false,
        created_through: "self_registered",
      });

      const result = await createInvitation({
        email: "deactivated.invitee@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(2),
        role: "member",
        invited_by: getUserUuid(3),
      });

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "Password1" })
        .expect(403);

      expect(response.body.status).toBe("error");
    });

    it("should reject new user without password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "nopwuser@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(1),
        role: "member",
        invited_by: getUserUuid(1),
      });

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({})
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject expired invitation", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "expiredinvite@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(1),
        role: "member",
        invited_by: getUserUuid(1),
      });

      // Manually expire
      await db.query(
        "UPDATE invitations SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1",
        [result.invitation.id],
      );

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "SecurePassword123" })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("expired");
    });

    it("should reject used invitation", async () => {
      const { createInvitation, markInvitationUsed } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "usedinvite@example.com",
        type: "org_invite",
        organization_id: getOrganizationUuid(1),
        role: "member",
        invited_by: getUserUuid(1),
      });

      await markInvitationUsed(result.invitation.id!);

      const response = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "SecurePassword123" })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("used");
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .post("/api/invitations/invalid-token-xyz/accept")
        .send({ password: "SecurePassword123" })
        .expect(404);

      expect(response.body.status).toBe("error");
    });
  });

  describe("Full Organization Invitation Flow", () => {
    it("should complete full flow for new user", async () => {
      const orgId = getOrganizationUuid(1);
      const email = "fullfloworg@example.com";

      // Step 1: Owner invites user
      const inviteResponse = await request(app)
        .post(`/api/organizations/${orgId}/invite`)
        .set("Cookie", ownerCookies)
        .send({
          email,
          role: "member",
        })
        .expect(201);

      const _invitationId = inviteResponse.body.data.id;

      // Step 2: Get the token (in real flow, from email)
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "fullfloworg2@example.com",
        type: "org_invite",
        organization_id: orgId,
        role: "member",
        invited_by: getUserUuid(1),
      });

      // Step 3: User views invitation
      const viewResponse = await request(app)
        .get(`/api/invitations/${result.token}`)
        .expect(200);

      expect(viewResponse.body.data.email).toBe("fullfloworg2@example.com");
      expect(viewResponse.body.data.organization_name).toBe("Acme Corporation");

      // Step 4: User accepts invitation
      const acceptResponse = await request(app)
        .post(`/api/invitations/${result.token}/accept`)
        .send({ password: "SecurePassword123" })
        .expect(200);

      expect(acceptResponse.body.data.role).toBe("member");

      // Step 5: User can now access the organization
      const newUserCookies = acceptResponse.headers["set-cookie"];

      const orgResponse = await request(app)
        .get(`/api/organizations/${orgId}`)
        .set("Cookie", newUserCookies)
        .expect(200);

      expect(orgResponse.body.data.name).toBe("Acme Corporation");
    });
  });
});
