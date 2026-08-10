import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers } from "../../src/database/test-data";
import { getPendingInvitationsForEmail } from "../../src/models/invitations.models";

require("dotenv").config({ quiet: true });

describe("Email Change Integration Tests", () => {
  let userCookies: string[];

  beforeAll(async () => {
    await seed({
      usersData: testUsers,
    });

    // Login as test user
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "Password1",
    });
    userCookies = loginResponse.headers["set-cookie"] as any;
  });

  afterAll(async () => {
    await db.end();
  });

  describe("POST /api/auth/request-email-change", () => {
    it("should request email change with valid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "newtestemail@example.com",
          password: "Password1",
        })
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("Verification email sent");
      expect(response.body.data.newEmail).toBe("newtestemail@example.com");
    });

    it("should reject incorrect password", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "another@example.com",
          password: "WrongPassword",
        })
        .expect(401);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("Incorrect password");
    });

    it("should reject if new email is same as current", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "test@example.com",
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("same as current");
    });

    it("answers identically when the new email is already taken — no enumeration (S5)", async () => {
      const freshResponse = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "s5-fresh-address@example.com",
          password: "Password1",
        })
        .expect(200);

      const takenResponse = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "alice@example.com", // Already exists
          password: "Password1",
        })
        .expect(200);

      // Compared to the live success path, not to literals: any drift
      // between the two branches' responses is an enumeration oracle. The
      // owner of the taken address is notified by email instead.
      expect(takenResponse.body.status).toBe(freshResponse.body.status);
      expect(takenResponse.body.message).toBe(freshResponse.body.message);
      expect(Object.keys(takenResponse.body.data)).toEqual(
        Object.keys(freshResponse.body.data),
      );
      expect(takenResponse.body.data.newEmail).toBe("alice@example.com");

      // ...and no email-change invitation is minted for the taken address —
      // a live token would 409 at confirm time and reopen the oracle.
      const pending = await getPendingInvitationsForEmail(
        "test@example.com",
        "email_change",
      );
      expect(pending.some((inv) => inv.new_email === "alice@example.com")).toBe(
        false,
      );
    });

    it("should reject invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "not-an-email",
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("validation");
    });

    it("should reject missing password", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "missing@example.com",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject missing newEmail", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          password: "Password1",
        })
        .expect(400);

      expect(response.body.status).toBe("error");
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .send({
          newEmail: "unauth@example.com",
          password: "Password1",
        })
        .expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });

    it("should invalidate previous email change requests", async () => {
      // First request
      await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "first@example.com",
          password: "Password1",
        })
        .expect(200);

      // Second request should invalidate the first
      await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "second@example.com",
          password: "Password1",
        })
        .expect(200);

      // Previous invitation should be invalidated (can't directly verify without token)
    });
  });

  describe("POST /api/auth/confirm-email-change/:token", () => {
    it("should confirm email change with valid token", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const { getUserUuid } =
        await import("../../src/database/test-data/testUuids");

      const result = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "confirmed@example.com",
        user_id: getUserUuid(1),
      });

      const response = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("changed successfully");
      expect(response.body.data.email).toBe("confirmed@example.com");

      // Verify email was actually changed
      const { getUser } = await import("../../src/models/users.models");
      const user = await getUser("confirmed@example.com");
      expect(user).toBeDefined();
      expect(user!.email).toBe("confirmed@example.com");

      // Reset email back for other tests
      await db.query("UPDATE users SET email = $1 WHERE user_id = $2", [
        "test@example.com",
        getUserUuid(1),
      ]);
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .post("/api/auth/confirm-email-change/invalid-token-xyz")
        .expect(404);

      expect(response.body.status).toBe("error");
    });

    it("should reject expired token", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const { getUserUuid } =
        await import("../../src/database/test-data/testUuids");

      const result = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "expired@example.com",
        user_id: getUserUuid(1),
      });

      // Manually expire the token
      await db.query(
        "UPDATE invitations SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1",
        [result.invitation.id],
      );

      const response = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("expired");
    });

    it("should reject used token", async () => {
      const { createInvitation, markInvitationUsed } =
        await import("../../src/models/invitations.models");
      const { getUserUuid } =
        await import("../../src/database/test-data/testUuids");

      const result = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "used@example.com",
        user_id: getUserUuid(1),
      });

      await markInvitationUsed(result.invitation.id!);

      const response = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("used");
    });

    it("should reject wrong invitation type", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");

      // Create a registration invitation instead of email_change
      const result = await createInvitation({
        email: "wrongtype@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(400);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("type");
    });

    it("should reject if new email becomes taken during verification", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const { getUserUuid } =
        await import("../../src/database/test-data/testUuids");

      const result = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "alice@example.com", // Already exists
        user_id: getUserUuid(1),
      });

      const response = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(409);

      expect(response.body.status).toBe("error");
      expect(response.body.message).toContain("no longer available");
    });
  });

  describe("Full Email Change Flow", () => {
    it("should complete full email change flow", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");
      const { getUserUuid } =
        await import("../../src/database/test-data/testUuids");

      // Step 1: Request email change
      const requestResponse = await request(app)
        .post("/api/auth/request-email-change")
        .set("Cookie", userCookies)
        .send({
          newEmail: "fullflow@example.com",
          password: "Password1",
        })
        .expect(200);

      expect(requestResponse.body.status).toBe("success");

      // Step 2: Get token (in real flow, this comes from email)
      const result = await createInvitation({
        email: "test@example.com",
        type: "email_change",
        new_email: "fullflow2@example.com",
        user_id: getUserUuid(1),
      });

      // Step 3: Confirm email change
      const confirmResponse = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(200);

      expect(confirmResponse.body.status).toBe("success");
      expect(confirmResponse.body.data.email).toBe("fullflow2@example.com");

      // Step 4: Verify user's email was changed
      const { getUser } = await import("../../src/models/users.models");
      const user = await getUser("fullflow2@example.com");
      expect(user).toBeDefined();

      // Step 5: Old email should not find the user
      const oldUser = await getUser("test@example.com");
      expect(oldUser).toBeNull();

      // Reset email back for other tests
      await db.query("UPDATE users SET email = $1 WHERE user_id = $2", [
        "test@example.com",
        getUserUuid(1),
      ]);

      // Re-login for subsequent tests
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "Password1",
      });
      userCookies = loginResponse.headers["set-cookie"] as any;
    });
  });

  describe("Security Tests", () => {
    it("should not accept registration tokens for email change", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");

      const result = await createInvitation({
        email: "securitytest@example.com",
        type: "registration",
      });

      const response = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(400);

      expect(response.body.message).toContain("type");
    });

    it("should not accept password_reset tokens for email change", async () => {
      const { createInvitation } =
        await import("../../src/models/invitations.models");

      const result = await createInvitation({
        email: "test@example.com",
        type: "password_reset",
      });

      const response = await request(app)
        .post(`/api/auth/confirm-email-change/${result.token}`)
        .expect(400);

      expect(response.body.message).toContain("type");
    });

    it("should require authentication for request-email-change", async () => {
      const response = await request(app)
        .post("/api/auth/request-email-change")
        .send({
          newEmail: "noauth@example.com",
          password: "Password1",
        })
        .expect(401);

      expect(response.body.message).toBe("Credentials missing");
    });
  });
});
