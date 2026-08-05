import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { url } from "../test/handlers";
import { api, type ApiError } from "./client";

const error401 = () =>
  HttpResponse.json(
    { status: "error", message: "Credentials missing" },
    { status: 401 },
  );

describe("apiClient single-flight refresh", () => {
  it("refreshes once for concurrent 401s, then all callers retry and succeed", async () => {
    let refreshCalls = 0;
    let refreshed = false;

    server.use(
      http.post(url("/auth/refresh"), () => {
        refreshCalls += 1;
        refreshed = true;
        return HttpResponse.json({
          status: "success",
          message: "Token refreshed",
        });
      }),
      http.get(url("/protected"), () =>
        refreshed
          ? HttpResponse.json({ status: "success", data: { ok: true } })
          : error401(),
      ),
    );

    // Three callers hit the expired session together — the S1 shape.
    const results = await Promise.all([
      api.get<{ data: { ok: boolean } }>("/protected"),
      api.get<{ data: { ok: boolean } }>("/protected"),
      api.get<{ data: { ok: boolean } }>("/protected"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.data.ok).toBe(true);
    }
  });

  it("surfaces the original 401 when the refresh itself fails", async () => {
    let refreshCalls = 0;

    server.use(
      http.post(url("/auth/refresh"), () => {
        refreshCalls += 1;
        return error401();
      }),
      http.get(url("/protected"), () => error401()),
    );

    await expect(api.get("/protected")).rejects.toMatchObject({
      status: 401,
      message: "Credentials missing",
    } satisfies Partial<ApiError>);
    // One refresh attempt, no retry loop.
    expect(refreshCalls).toBe(1);
  });

  it("does not try to refresh a failed refresh call", async () => {
    let refreshCalls = 0;

    server.use(
      http.post(url("/auth/refresh"), () => {
        refreshCalls += 1;
        return error401();
      }),
    );

    await expect(api.post("/auth/refresh")).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshCalls).toBe(1);
  });

  it("does not refresh-and-retry a handler-minted 401 (wrong credentials)", async () => {
    let refreshCalls = 0;
    let loginAttempts = 0;

    server.use(
      http.post(url("/auth/refresh"), () => {
        refreshCalls += 1;
        return HttpResponse.json({
          status: "success",
          message: "Token refreshed",
        });
      }),
      http.post(url("/auth/login"), () => {
        loginAttempts += 1;
        return HttpResponse.json(
          { status: "error", message: "Invalid credentials" },
          { status: 401 },
        );
      }),
    );

    await expect(
      api.post("/auth/login", { email: "a@b.c", password: "wrong" }),
    ).rejects.toMatchObject({ status: 401, message: "Invalid credentials" });

    // The failed attempt is surfaced, not silently re-submitted.
    expect(loginAttempts).toBe(1);
    expect(refreshCalls).toBe(0);
  });

  it("passes non-401 errors through untouched", async () => {
    let refreshCalls = 0;

    server.use(
      http.post(url("/auth/refresh"), () => {
        refreshCalls += 1;
        return error401();
      }),
      http.get(url("/protected"), () =>
        HttpResponse.json(
          { status: "error", message: "Insufficient permissions" },
          { status: 403 },
        ),
      ),
    );

    await expect(api.get("/protected")).rejects.toMatchObject({
      status: 403,
      message: "Insufficient permissions",
    });
    expect(refreshCalls).toBe(0);
  });
});
