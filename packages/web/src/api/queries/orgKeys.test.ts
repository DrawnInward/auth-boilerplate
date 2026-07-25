import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { orgKeys } from "./orgKeys";

const ORG = "org-1";
const OTHER_ORG = "org-2";

describe("orgKeys", () => {
  it("builds hierarchical keys under a single root", () => {
    expect(orgKeys.all).toEqual(["org"]);
    expect(orgKeys.detail(ORG)).toEqual(["org", ORG]);
    expect(orgKeys.members(ORG)).toEqual(["org", ORG, "members"]);
    expect(orgKeys.invitations(ORG)).toEqual(["org", ORG, "invitations"]);
  });

  // The hooks depend on prefix matching for invalidation; these tests pin that
  // property through React Query itself rather than by comparing arrays.
  describe("invalidation reach", () => {
    const seed = () => {
      const client = new QueryClient();
      client.setQueryData(orgKeys.all, ["list"]);
      client.setQueryData(orgKeys.detail(ORG), { id: ORG });
      client.setQueryData(orgKeys.members(ORG), []);
      client.setQueryData(orgKeys.invitations(ORG), []);
      client.setQueryData(orgKeys.detail(OTHER_ORG), { id: OTHER_ORG });
      client.setQueryData(orgKeys.members(OTHER_ORG), []);
      return client;
    };

    const staleKeys = (client: QueryClient) =>
      client
        .getQueryCache()
        .findAll({ stale: true })
        .map((query) => query.queryKey);

    it("invalidating the root reaches every organization key", () => {
      const client = seed();

      client.invalidateQueries({ queryKey: orgKeys.all });

      expect(staleKeys(client)).toHaveLength(6);
    });

    it("invalidating one organization leaves other organizations alone", () => {
      const client = seed();

      client.invalidateQueries({ queryKey: orgKeys.detail(ORG) });

      expect(staleKeys(client)).toEqual(
        expect.arrayContaining([
          orgKeys.detail(ORG),
          orgKeys.members(ORG),
          orgKeys.invitations(ORG),
        ]),
      );
      expect(staleKeys(client)).not.toEqual(
        expect.arrayContaining([orgKeys.detail(OTHER_ORG)]),
      );
    });

    it("invalidating a sub-list does not invalidate its siblings", () => {
      const client = seed();

      client.invalidateQueries({ queryKey: orgKeys.members(ORG) });

      expect(staleKeys(client)).toEqual([orgKeys.members(ORG)]);
    });
  });
});
