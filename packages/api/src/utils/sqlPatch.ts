// Shared builder for allow-list patch writes. Hand-counting placeholder offsets
// is the bug this removes, by making the offset an argument.
//
// Semantics shared by every caller: undefined means "untouched", null is a
// value (it clears); keys outside the allow-list are dropped. An empty result
// throws — request emptiness is validated at the edge (Zod), so an empty patch
// reaching here is a programmer error.

export type SqlPatch = {
  columns: string[];
  values: unknown[];
  /** `col = $N` clauses, placeholders numbered from startIndex. */
  setClauses: (startIndex: number) => string[];
};

export const buildPatch = (
  patch: Record<string, unknown>,
  allowedFields: readonly string[],
  label: string,
): SqlPatch => {
  const entries = Object.entries(patch).filter(
    ([key, value]) => allowedFields.includes(key) && value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error(`${label} requires at least one field`);
  }

  return {
    columns: entries.map(([key]) => key),
    values: entries.map(([, value]) => value),
    setClauses: (startIndex: number) =>
      entries.map(([key], i) => `${key} = $${i + startIndex}`),
  };
};
