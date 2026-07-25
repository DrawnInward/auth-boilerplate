// Shared builder for allow-list patch writes. Hand-counting placeholder offsets
// is the bug this removes, by making the offset an argument.
//
// Semantics shared by every caller: undefined means "untouched", null is a
// value (it clears); keys outside the allow-list are dropped. An empty result
// is a client error, not a programmer error — a patch body whose every key was
// unknown or undefined is a bad request, and the model suites pin it to
// 400 "No valid fields to update".

import { httpError } from "./httpError";

export type SqlPatch = {
  values: unknown[];
  /** `col = $N` clauses, placeholders numbered from startIndex. */
  setClauses: (startIndex: number) => string[];
};

export const buildPatch = (
  patch: Record<string, unknown>,
  allowedFields: readonly string[],
): SqlPatch => {
  const entries = Object.entries(patch).filter(
    ([key, value]) => allowedFields.includes(key) && value !== undefined,
  );

  if (entries.length === 0) {
    throw httpError(400, "No valid fields to update");
  }

  return {
    values: entries.map(([, value]) => value),
    setClauses: (startIndex: number) =>
      entries.map(([key], i) => `${key} = $${i + startIndex}`),
  };
};
