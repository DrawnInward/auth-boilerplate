import request from "supertest";
import app from "../../src/app";
import db from "../../src/database/db";
import seed from "../../src/database/seed";
import { testUsers } from "../../src/database/test-data";

require("dotenv").config({ quiet: true });

const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

describe("Security headers and origin check (S6)", () => {
  beforeAll(async () => {
    await seed({ usersData: testUsers });
  });

  afterAll(async () => {
    await db.end();
  });

  describe("helmet headers", () => {
    it("sets the standard security headers on every response", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "alice@example.com",
        password: "Password1",
      });

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBeDefined();
      expect(response.headers["strict-transport-security"]).toBeDefined();
      expect(response.headers["x-powered-by"]).toBeUndefined();
    });
  });

  describe("origin check", () => {
    it("rejects a cross-origin state-changing request", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .set("Origin", "https://evil.example.com")
        .send({ email: "alice@example.com", password: "Password1" })
        .expect(403);

      expect(response.body).toEqual({
        status: "error",
        message: "Cross-origin request rejected",
      });
    });

    it("allows a state-changing request from the configured origin", async () => {
      await request(app)
        .post("/api/auth/login")
        .set("Origin", allowedOrigin)
        .send({ email: "alice@example.com", password: "Password1" })
        .expect(200);
    });

    it("allows a state-changing request with no Origin header", async () => {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@example.com", password: "Password1" })
        .expect(200);
    });

    it("ignores the Origin header on reads", async () => {
      await request(app)
        .get("/api/config")
        .set("Origin", "https://evil.example.com")
        .expect(200);
    });
  });
});
