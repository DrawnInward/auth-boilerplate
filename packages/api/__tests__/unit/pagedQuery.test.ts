import { pagedQuery } from "../../src/utils/pagedQuery";

describe("pagedQuery", () => {
  const select = "SELECT * FROM users";

  it("emits no WHERE clause when there is nothing to filter on", () => {
    const { text, values } = pagedQuery({ select, orderBy: "created_at DESC" });

    expect(text).toBe("SELECT * FROM users ORDER BY created_at DESC");
    expect(values).toEqual([]);
  });

  it("ANDs literal conditions without binding values", () => {
    const { text, values } = pagedQuery({
      select,
      where: ["deleted_at IS NULL", "expires_at > NOW()"],
      orderBy: "created_at DESC",
    });

    expect(text).toBe(
      "SELECT * FROM users WHERE deleted_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC",
    );
    expect(values).toEqual([]);
  });

  it("numbers equals placeholders in key order, after literal conditions", () => {
    const { text, values } = pagedQuery({
      select,
      where: ["deleted_at IS NULL"],
      equals: { is_active: true, email_verified: false },
      orderBy: "created_at DESC",
    });

    expect(text).toBe(
      "SELECT * FROM users WHERE deleted_at IS NULL AND is_active = $1 AND email_verified = $2 ORDER BY created_at DESC",
    );
    expect(values).toEqual([true, false]);
  });

  it("drops undefined equals values but keeps null, which is a value", () => {
    const { text, values } = pagedQuery({
      select,
      equals: { is_active: undefined, deactivated_by: null },
      orderBy: "created_at DESC",
    });

    expect(text).toBe(
      "SELECT * FROM users WHERE deactivated_by = $1 ORDER BY created_at DESC",
    );
    expect(values).toEqual([null]);
  });

  it("numbers pagination placeholders after the filter values", () => {
    const { text, values } = pagedQuery({
      select,
      equals: { is_active: true },
      orderBy: "created_at DESC",
      pagination: { limit: 10, offset: 20 },
    });

    expect(text).toBe(
      "SELECT * FROM users WHERE is_active = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    );
    expect(values).toEqual([true, 10, 20]);
  });

  it("accepts qualified column names for joined queries", () => {
    const { text, values } = pagedQuery({
      select:
        "SELECT o.* FROM organizations o JOIN members m ON m.org_id = o.id",
      equals: { "o.owner_id": "owner-1", "m.user_id": "user-1" },
      orderBy: "o.created_at DESC",
    });

    expect(text).toBe(
      "SELECT o.* FROM organizations o JOIN members m ON m.org_id = o.id WHERE o.owner_id = $1 AND m.user_id = $2 ORDER BY o.created_at DESC",
    );
    expect(values).toEqual(["owner-1", "user-1"]);
  });

  // The list models relied on a falsy check, so these are "unset", not clauses.
  it.each([
    ["limit and offset omitted", {}, "", []],
    ["limit only", { limit: 5 }, " LIMIT $1", [5]],
    ["offset only", { offset: 5 }, " OFFSET $1", [5]],
    ["zero limit is unset", { limit: 0 }, "", []],
    ["zero offset is from the start", { offset: 0 }, "", []],
  ])("%s", (_name, pagination, expectedTail, expectedValues) => {
    const { text, values } = pagedQuery({
      select,
      orderBy: "created_at DESC",
      pagination,
    });

    expect(text).toBe(
      `SELECT * FROM users ORDER BY created_at DESC${expectedTail}`,
    );
    expect(values).toEqual(expectedValues);
  });

  it("rejects a column name that is not a plain identifier", () => {
    expect(() =>
      pagedQuery({
        select,
        equals: { "email; DROP TABLE users": "x" },
        orderBy: "created_at DESC",
      }),
    ).toThrow('pagedQuery: unsafe column name "email; DROP TABLE users"');
  });
});
