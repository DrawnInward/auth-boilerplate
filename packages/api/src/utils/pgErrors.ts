// Typed checks for Postgres driver errors, so models can map constraint
// violations without scattering magic strings, and callers can branch on the
// kind of violation without knowing the code.
// Codes: https://www.postgresql.org/docs/current/errcodes-appendix.html

const PG_CODES = {
  foreignKeyViolation: "23503",
  uniqueViolation: "23505",
  checkViolation: "23514",
  notNullViolation: "23502",
} as const;

const pgCodeOf = (err: unknown): string | undefined =>
  err !== null && typeof err === "object" && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;

export const isForeignKeyViolation = (err: unknown): boolean =>
  pgCodeOf(err) === PG_CODES.foreignKeyViolation;

export const isUniqueViolation = (err: unknown): boolean =>
  pgCodeOf(err) === PG_CODES.uniqueViolation;

export const isCheckViolation = (err: unknown): boolean =>
  pgCodeOf(err) === PG_CODES.checkViolation;

export const isNotNullViolation = (err: unknown): boolean =>
  pgCodeOf(err) === PG_CODES.notNullViolation;

// The constraint name that was violated, when the driver reports one — lets a
// caller distinguish two unique indexes on the same table.
export const violatedConstraint = (err: unknown): string | undefined =>
  err !== null && typeof err === "object" && "constraint" in err
    ? String((err as { constraint: unknown }).constraint)
    : undefined;
