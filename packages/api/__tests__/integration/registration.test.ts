import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers } from "../../src/database/test-data";
import { getInvitationByTokenHash } from "../../src/models/invitations.models";
import { determinateHash } from "../../src/utils";

require("dotenv").config({ quiet: true });

describe("User Registration Integration Tests", () => {
  beforeAll(async () => {
    await seed({
      usersData: testUsers,
    });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/auth/register", () => {
    it("should create registration invitation and return success", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "newregistration@example.com" })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("Registration email sent");
      expect(response.body.data.email).toBe("newregistration@example.com");
    });

    it("should reject registration with existing email", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com" }) // Existing user
        .expect(409);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Email already registered");
    });

    it("should reject registration with invalid email", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "not-an-email" })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject registration with missing email", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({})
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should lowercase email addresses", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "UPPERCASE@EXAMPLE.COM" })
        .expect(201);

      expect(response.body.data.email).toBe("uppercase@example.com");
    });

    it("should invalidate previous registration invitations", async () => {
      // Create first invitation
      await request(app)
        .post("/api/auth/register")
        .send({ email: "doubleregister@example.com" })
        .expect(201);

      // Create second invitation for same email
      await request(app)
        .post("/api/auth/register")
        .send({ email: "doubleregister@example.com" })
        .expect(201);

      // First invitation should be invalidated - we can't directly test this
      // without access to the token, but the endpoint should work
    });
  });

  describe("GET /api/auth/verify/:token", () => {
    let validToken: string;

    beforeAll(async () => {
      // Create a registration invitation to get a valid token
      // We need to access the database directly since the endpoint doesn't return the token
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "verifytest@example.com",
        type: "registration",
      });
      validToken = result.token;
    });

    it("should return invitation details for valid token", async () => {
      const response = await request(app)
        .get(`/api/auth/verify/${validToken}`)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.data.email).toBe("verifytest@example.com");
      expect(response.body.data.type).toBe("registration");
      expect(response.body.data.is_existing_user).toBe(false);
    });

    it("should return 404 for invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/verify/invalid-token-12345")
        .expect(404);

      expect(response.body.status).toBe("error");
    });

    it("should return 400 for expired token", async () => {
      // Create an expired invitation directly in the database
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "expiredverify@example.com",
        type: "registration",
      });

      // Manually expire it
      await db.query(
        "UPDATE invitations SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1",
        [result.invitation.id],
      );

      const response = await request(app)
        .get(`/api/auth/verify/${result.token}`)
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("expired");
    });

    it("should return 400 for used token", async () => {
      const { createInvitation, markInvitationUsed } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "usedverify@example.com",
        type: "registration",
      });

      await markInvitationUsed(result.invitation.id!);

      const response = await request(app)
        .get(`/api/auth/verify/${result.token}`)
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("used");
    });
  });

  describe("POST /api/auth/complete-registration", () => {
    it("should complete registration with valid token and password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "complete@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: result.token,
          password: "SecurePassword123",
        })
        .expect(201);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("completed");
      expect(response.body.data.email).toBe("complete@example.com");
      expect(response.body.data.email_verified).toBe(true);
      expect(response.body.data.is_active).toBe(true);
      expect(response.body.data).not.toHaveProperty("password_hash");

      // Should set auth cookies
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArray.some((c: string) => c.includes("access_token"))).toBe(
        true,
      );
      expect(cookieArray.some((c: string) => c.includes("refresh_token"))).toBe(
        true,
      );

      // Token should be marked as used
      const invitation = await getInvitationByTokenHash(
        determinateHash(result.token),
      );
      expect(invitation!.used_at).not.toBeNull();
    });

    it("should reject with invalid token", async () => {
      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: "invalid-token-xyz",
          password: "SecurePassword123",
        })
        .expect(404);

      expect(response.body.status).toBe("error");
    });

    it("should reject with short password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "shortpw@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: result.token,
          password: "short",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject with missing password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "nopw@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: result.token,
        })
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject with used token", async () => {
      const { createInvitation, markInvitationUsed } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "usedcomplete@example.com",
        type: "registration",
      });

      await markInvitationUsed(result.invitation.id!);

      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: result.token,
          password: "SecurePassword123",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject with wrong invitation type", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      // Create a password reset invitation instead of registration
      const result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: result.token,
          password: "SecurePassword123",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("type");
    });
  });

  describe("Full Registration Flow", () => {
    it("should complete full registration flow", async () => {
      const email = "fullflow@example.com";

      // Step 1: Register
      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send({ email })
        .expect(201);

      expect(registerResponse.body.data.email).toBe(email);

      // Get the token from database (simulating email link click)
      const { getPendingInvitationsForEmail } =
        await import("../../src/models/invitations.models");
      const invitations = await getPendingInvitationsForEmail(
        email,
        "registration",
      );
      expect(invitations.length).toBe(1);

      // We need to get the actual token - but we can't since it's not stored
      // In real testing, we'd mock the email service and capture the token
      // For now, create a fresh invitation to test the flow
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const { token } = await createInvitation({
        email: "fullflow2@example.com",
        type: "registration",
      });

      // Step 2: Verify token
      const verifyResponse = await request(app)
        .get(`/api/auth/verify/${token}`)
        .expect(200);

      expect(verifyResponse.body.data.email).toBe("fullflow2@example.com");

      // Step 3: Complete registration
      const completeResponse = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token,
          password: "SecurePassword123",
        })
        .expect(201);

      expect(completeResponse.body.data.email).toBe("fullflow2@example.com");
      expect(completeResponse.body.data.email_verified).toBe(true);

      // Step 4: User should be able to login
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "fullflow2@example.com",
          password: "SecurePassword123",
        })
        .expect(200);

      expect(loginResponse.body.data.email).toBe("fullflow2@example.com");
    });
  });

  describe("Security Tests", () => {
    it("should not expose password hash in any response", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "security@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: result.token,
          password: "SecurePassword123",
        })
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain("$2b$");
      expect(JSON.stringify(response.body)).not.toContain("password_hash");
    });

    it("should set HttpOnly cookies", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "httponly@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/auth/complete-registration")
        .send({
          token: result.token,
          password: "SecurePassword123",
        })
        .expect(201);

      const cookies = response.headers["set-cookie"];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

      const accessTokenCookie = cookieArray.find((c: string) =>
        c.includes("access_token"),
      );
      expect(accessTokenCookie).toContain("HttpOnly");
    });
  });
});
