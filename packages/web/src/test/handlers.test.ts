// Guards the guard: the default handlers validate request bodies with the
// shared Zod schemas, which is what makes a contract drift between the API and
// the web package fail a test. If that validation is ever dropped, these fail.

import { describe, expect, it } from "vitest";
import { api } from "@/api/client";
import type { ApiError } from "@/api/client";

describe("MSW handler contract validation", () => {
  it("accepts a payload the shared schema considers valid", async () => {
    await expect(
      api.post("/organizations", { name: "Valid Name", slug: "valid-name" }),
    ).resolves.toMatchObject({ status: "success" });
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a missing name", {}],
    ["a slug with illegal characters", { name: "Ok", slug: "Not A Slug" }],
  ])("rejects %s with the API's 400 envelope", async (_case, body) => {
    await expect(api.post("/organizations", body)).rejects.toMatchObject({
      status: 400,
      message: "Request body validation failed",
    });
  });

  it("reports which field failed, as the API does", async () => {
    const error = await api
      .post("/organizations", { name: "Ok", slug: "Not A Slug" })
      .catch((e: ApiError) => e);

    expect((error as ApiError).errors).toEqual([
      expect.objectContaining({ field: "slug" }),
    ]);
  });
});
