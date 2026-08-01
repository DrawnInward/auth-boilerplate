import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers } from "../../src/database/test-data";
import { getUserUuid } from "../../src/database/test-data/testUuids";

require("dotenv").config({ quiet: true });

// B4: the self-account mutation endpoints, which previously had no spec at
// all. PUT /auth/profile is characterised as the read-only no-op it currently
// is (D3 will either implement or remove it — this spec pins today's
// behaviour and must change with it). 401/unauthenticated and 403/wrong-role
// for both routes are asserted by roleBoundary.test.ts.

describe("Self-account mutations (B4)", () => {
  const login = async (email: string, password = "Password1") => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email, password })
      .expect(200);
    return response.headers["set-cookie"] as unknown as string[];
  };

  beforeAll(async () => {
    await seed({ usersData: testUsers });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("PUT /api/auth/profile", () => {
    let aliceCookies: string[];

    beforeAll(async () => {
      aliceCookies = await login("alice@example.com");
    });

    it("returns the current profile", async () => {
      const response = await request(app)
        .put("/api/auth/profile")
        .set("Cookie", aliceCookies)
        .send({})
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(response.body.message).toBe("Profile retrieved successfully");
      expect(response.body.data).toEqual({
        user_id: getUserUuid(2),
        email: "alice@example.com",
        email_verified: true,
        is_active: true,
        mfa_enabled: false,
        auth_provider: "local",
      });
    });

    it("does not change the email when one is supplied (no-op, D3)", async () => {
      const response = await request(app)
        .put("/api/auth/profile")
        .set("Cookie", aliceCookies)
        .send({ email: "hijacked@example.com" })
        .expect(200);

      expect(response.body.data.email).toBe("alice@example.com");

      const me = await request(app)
        .get("/api/auth/me")
        .set("Cookie", aliceCookies)
        .expect(200);
      expect(me.body.data.email).toBe("alice@example.com");
    });

    it("rejects a malformed email", async () => {
      await request(app)
        .put("/api/auth/profile")
        .set("Cookie", aliceCookies)
        .send({ email: "not-an-email" })
        .expect(400);
    });
  });

  describe("PUT /api/auth/change-password", () => {
    it("rejects a missing current_password", async () => {
      const cookies = await login("test@example.com");

      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ new_password: "NewPassword1" })
        .expect(400);
    });

    it("rejects a new_password shorter than 8 characters", async () => {
      const cookies = await login("test@example.com");

      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ current_password: "Password1", new_password: "short" })
        .expect(400);
    });

    it("rejects an incorrect current password without changing anything", async () => {
      const cookies = await login("test@example.com");

      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({
          current_password: "WrongPassword1",
          new_password: "NewPassword1",
        })
        .expect(401);

      expect(response.body.message).toBe("Current password is incorrect");

      // The old password still works.
      await login("test@example.com", "Password1");
    });

    it("changes the password: old rejected, new accepted", async () => {
      const cookies = await login("test@example.com");

      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ current_password: "Password1", new_password: "NewPassword1" })
        .expect(200);

      expect(response.body.message).toBe("Password changed successfully");

      await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "Password1" })
        .expect(401);

      const newCookies = await login("test@example.com", "NewPassword1");

      // Restore the fixture password for the rest of the file.
      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", newCookies)
        .send({ current_password: "NewPassword1", new_password: "Password1" })
        .expect(200);
    });

    it("revokes existing refresh tokens", async () => {
      const cookies = await login("alice@example.com");

      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ current_password: "Password1", new_password: "NewPassword1" })
        .expect(200);

      // The pre-change refresh token alone can no longer mint a session.
      const refreshOnly = cookies.filter((c) => c.startsWith("refresh_token="));
      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", refreshOnly)
        .expect(403);
      expect(response.body.message).toBe("Invalid Token");

      // Restore: the access token in the old cookie set is still valid.
      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ current_password: "NewPassword1", new_password: "Password1" })
        .expect(200);
    });

    it("directs a passwordless (OAuth) account to set-password instead", async () => {
      const cookies = await login("test@example.com");
      const userId = getUserUuid(1);

      const saved = await db.query(
        "SELECT password_hash FROM users WHERE user_id = $1",
        [userId],
      );

      await db.query(
        "UPDATE users SET password_hash = NULL WHERE user_id = $1",
        [userId],
      );

      try {
        const response = await request(app)
          .put("/api/auth/change-password")
          .set("Cookie", cookies)
          .send({ current_password: "Password1", new_password: "NewPassword1" })
          .expect(400);

        expect(response.body.message).toBe(
          "No password set. Use set-password endpoint instead.",
        );
      } finally {
        await db.query(
          "UPDATE users SET password_hash = $1 WHERE user_id = $2",
          [saved.rows[0].password_hash, userId],
        );
      }
    });
  });
});
