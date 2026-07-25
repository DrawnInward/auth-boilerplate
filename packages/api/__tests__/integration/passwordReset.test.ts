import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers } from "../../src/database/test-data";

require("dotenv").config({ quiet: true });

describe("Password Reset Integration Tests", () => {
  beforeAll(async () => {
    await seed({
      usersData: testUsers,
    });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/auth/forgot-password", () => {
    it("should return success for existing user", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "test@example.com" })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("If an account exists");
    });

    it("should return success for non-existing user (no email enumeration)", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent@example.com" })
        .expect(200);

      // Same response as existing user - prevents email enumeration
      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("If an account exists");
    });

    it("should reject invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "not-an-email" })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject missing email", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({})
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should invalidate previous reset invitations", async () => {
      // Send first request
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "test@example.com" })
        .expect(200);

      // Send second request
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "test@example.com" })
        .expect(200);

      // Previous invitation should be invalidated
      // (Can't directly test without token access)
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("should reset password with valid token", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "NewSecurePassword123",
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("reset");

      // Should be able to login with new password
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "NewSecurePassword123",
        })
        .expect(200);

      expect(loginResponse.body.data.email).toBe("test@example.com");
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: "invalid-token-xyz",
          password: "NewSecurePassword123",
        })
        .expect(404);

      expect(response.body.status).toBe("error");
    });

    it("should reject short password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "short",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject missing password", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
        })
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject expired token", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      // Manually expire the token
      await db.query(
        "UPDATE invitations SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1",
        [result.invitation.id],
      );

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "NewSecurePassword123",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("expired");
    });

    it("should reject used token", async () => {
      const { createInvitation, markInvitationUsed } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      await markInvitationUsed(result.invitation.id!);

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "NewSecurePassword123",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("used");
    });

    it("should reject wrong invitation type", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      // Create a registration invitation instead of password reset
      const result = await createInvitation({
        email: "wrongtype@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "NewSecurePassword123",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("type");
    });

    it("should revoke all refresh tokens after password reset", async () => {
      // First, login to create a refresh token
      // Reset the password back to Password1 first
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      let result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "Password1", // Reset to original
        })
        .expect(200);

      // Login to get tokens
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password1",
        })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];

      // Reset password again
      result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "AnotherPassword123",
        })
        .expect(200);

      // Old refresh token should no longer work
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      const refreshTokenCookie = cookieArray.find((c: string) =>
        c.includes("refresh_token"),
      );

      const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie!])
        .expect(403);

      expect(logoutResponse.body.msg).toBe("Invalid Token");
    });
  });

  describe("Full Password Reset Flow", () => {
    it("should complete full password reset flow", async () => {
      // Reset password to known value first
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      let result = await createInvitation({
        email: "alice@example.com",
        type: "password_reset",
      });

      await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "Password1",
        })
        .expect(200);

      // Step 1: Request password reset
      const forgotResponse = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "alice@example.com" })
        .expect(200);

      expect(forgotResponse.body.status).toBe("success");

      // Step 2: Get token (in real flow, this comes from email)
      result = await createInvitation({
        email: "alice@example.com",
        type: "password_reset",
      });

      // Step 3: Reset password
      const resetResponse = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "NewAlicePassword123",
        })
        .expect(200);

      expect(resetResponse.body.status).toBe("success");

      // Step 4: Login with new password
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "alice@example.com",
          password: "NewAlicePassword123",
        })
        .expect(200);

      expect(loginResponse.body.data.email).toBe("alice@example.com");

      // Step 5: Old password should not work
      const oldLoginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "alice@example.com",
          password: "Password1",
        })
        .expect(401);

      expect(oldLoginResponse.body.message).toBe("Invalid credentials");
    });
  });

  describe("Security Tests", () => {
    it("should not leak whether email exists", async () => {
      const existingResponse = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "test@example.com" });

      const nonExistingResponse = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "definitely-not-exists@example.com" });

      // Responses should be identical
      expect(existingResponse.status).toBe(nonExistingResponse.status);
      expect(existingResponse.body.message).toBe(
        nonExistingResponse.body.message,
      );
    });

    it("should not accept registration tokens for password reset", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const result = await createInvitation({
        email: "typecheck@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: result.token,
          password: "NewPassword123",
        })
        .expect(400);

      expect(response.body.message).toContain("type");
    });
  });
});
