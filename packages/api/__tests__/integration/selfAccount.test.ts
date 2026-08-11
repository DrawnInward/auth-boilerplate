import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers } from "../../src/database/test-data";
import { getUserUuid } from "../../src/database/test-data/testUuids";
import { loginAs } from "../helpers/loginAs";

require("dotenv").config({ quiet: true });

// B4: the self-account mutation endpoints, which previously had no spec at
// all. PUT /auth/profile was removed under D3 (profile's only field is email,
// and email changes go through the verified request-email-change flow) — a
// test pins its absence. 401/unauthenticated and 403/wrong-role are asserted
// by roleBoundary.test.ts.
//
// loginAs is plumbing; where a login attempt IS the assertion (old password
// rejected, new accepted) the test hits the endpoint directly.

describe("Self-account mutations (B4)", () => {
  beforeAll(async () => {
    await seed({ usersData: testUsers });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("PUT /api/auth/profile (removed, D3)", () => {
    it("no longer exists", async () => {
      const aliceCookies = await loginAs("alice@example.com");

      await request(app)
        .put("/api/auth/profile")
        .set("Cookie", aliceCookies)
        .send({ email: "hijacked@example.com" })
        .expect(404);

      const me = await request(app)
        .get("/api/auth/me")
        .set("Cookie", aliceCookies)
        .expect(200);
      expect(me.body.data.email).toBe("alice@example.com");
    });
  });

  describe("PUT /api/auth/change-password", () => {
    it("rejects a missing current_password", async () => {
      const cookies = await loginAs("test@example.com");

      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ new_password: "NewPassword1" })
        .expect(400);
    });

    it("rejects a new_password shorter than 8 characters", async () => {
      const cookies = await loginAs("test@example.com");

      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ current_password: "Password1", new_password: "short" })
        .expect(400);
    });

    it("rejects an incorrect current password without changing anything", async () => {
      const cookies = await loginAs("test@example.com");

      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({
          current_password: "WrongPassword1",
          new_password: "NewPassword1",
        })
        .expect(401);

      expect(response.body.message).toBe("Current password is incorrect");

      // The old password still works — a real login, not the cached cookies.
      await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "Password1" })
        .expect(200);
    });

    it("changes the password: old rejected, new accepted", async () => {
      const cookies = await loginAs("test@example.com");

      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ current_password: "Password1", new_password: "NewPassword1" })
        .expect(200);

      // Once the change has committed, the restore must run even if an
      // assertion below fails — a stranded NewPassword1 cascade-fails every
      // later login in the file and buries the real failure.
      try {
        expect(response.body.message).toBe("Password changed successfully");

        await request(app)
          .post("/api/auth/login")
          .send({ email: "test@example.com", password: "Password1" })
          .expect(401);

        await request(app)
          .post("/api/auth/login")
          .send({ email: "test@example.com", password: "NewPassword1" })
          .expect(200);
      } finally {
        // The access token in the pre-change cookie set is still valid.
        await request(app)
          .put("/api/auth/change-password")
          .set("Cookie", cookies)
          .send({ current_password: "NewPassword1", new_password: "Password1" })
          .expect(200);
      }
    });

    it("revokes existing refresh tokens", async () => {
      const cookies = await loginAs("alice@example.com");

      await request(app)
        .put("/api/auth/change-password")
        .set("Cookie", cookies)
        .send({ current_password: "Password1", new_password: "NewPassword1" })
        .expect(200);

      try {
        // The pre-change refresh token can no longer be exchanged for a
        // session. (loginAs types its cookie jar as string for .set(); it is
        // an array at runtime.)
        const refreshOnly = (cookies as unknown as string[]).filter((c) =>
          c.startsWith("refresh_token="),
        );
        const response = await request(app)
          .post("/api/auth/refresh")
          .set("Cookie", refreshOnly)
          .expect(401);
        expect(response.body.message).toBe("Refresh token has been revoked");
      } finally {
        // Restore: the access token in the old cookie set is still valid.
        await request(app)
          .put("/api/auth/change-password")
          .set("Cookie", cookies)
          .send({ current_password: "NewPassword1", new_password: "Password1" })
          .expect(200);
      }
    });

    it("directs a passwordless (OAuth) account to set-password instead", async () => {
      const cookies = await loginAs("test@example.com");
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
