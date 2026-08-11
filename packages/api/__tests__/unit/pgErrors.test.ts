import {
  isForeignKeyViolation,
  isUniqueViolation,
  isCheckViolation,
  isNotNullViolation,
  violatedConstraint,
} from "../../src/utils/pgErrors";

// B5: the typed Postgres error checks models use to map constraint violations.

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error("pg error"), { code, constraint });

describe("pgErrors", () => {
  const helpers = [
    ["isForeignKeyViolation", isForeignKeyViolation, "23503"],
    ["isUniqueViolation", isUniqueViolation, "23505"],
    ["isCheckViolation", isCheckViolation, "23514"],
    ["isNotNullViolation", isNotNullViolation, "23502"],
  ] as const;

  it.each(helpers)("%s matches only its own code", (_name, helper, code) => {
    expect(helper(pgError(code))).toBe(true);

    const otherCodes = helpers.map(([, , c]) => c).filter((c) => c !== code);
    otherCodes.forEach((other) => {
      expect(helper(pgError(other))).toBe(false);
    });
  });

  it.each(helpers)("%s is false for non-pg errors", (_name, helper) => {
    expect(helper(new Error("plain"))).toBe(false);
    expect(helper(null)).toBe(false);
    expect(helper(undefined)).toBe(false);
    expect(helper("23505")).toBe(false);
  });

  describe("violatedConstraint", () => {
    it("extracts the constraint name when the driver reports one", () => {
      expect(violatedConstraint(pgError("23505", "users_email_key"))).toBe(
        "users_email_key",
      );
    });

    it("is undefined when absent", () => {
      expect(violatedConstraint(new Error("plain"))).toBeUndefined();
      expect(violatedConstraint(null)).toBeUndefined();
    });

    it("is undefined when the property exists but carries no name", () => {
      // pg-protocol assigns `constraint` on every DatabaseError — a real
      // constraint-less pg error has the property with value undefined.
      expect(violatedConstraint(pgError("23502"))).toBeUndefined();
    });
  });
});
