// Shared builder for paginated list SELECTs. Hand-counting placeholder offsets
// across "optional filter, then LIMIT, then OFFSET" is the bug this removes —
// every list model was tracking a paramIndex by hand.
//
// Structure is caller-supplied SQL, values are bound. `select`, `where` and
// `orderBy` are interpolated verbatim, so they must be code literals — never
// request data. `equals` keys are column names (also code literals) and are
// identifier-checked as a backstop; only its values are ever bound.
//
// Pagination semantics match what the list models did by hand: a falsy limit or
// offset emits no clause, so `offset: 0` is "from the start", not `OFFSET 0`.

import { PaginationOptions } from "../types/PaginationOptions";

export type PagedQuerySpec = {
  /** Code literal: column list, FROM, and any JOINs. */
  select: string;
  /** Code literals, ANDed together. Bind no values. */
  where?: readonly string[];
  /** `column = value` conditions; undefined values are dropped. */
  equals?: Readonly<Record<string, unknown>>;
  /** Code literal, without the ORDER BY keyword. */
  orderBy: string;
  pagination?: PaginationOptions;
};

export type BuiltQuery = {
  text: string;
  values: unknown[];
};

const SAFE_COLUMN = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

export const pagedQuery = ({
  select,
  where = [],
  equals = {},
  orderBy,
  pagination = {},
}: PagedQuerySpec): BuiltQuery => {
  const values: unknown[] = [];
  const conditions = [...where];

  for (const [column, value] of Object.entries(equals)) {
    if (value === undefined) continue;
    if (!SAFE_COLUMN.test(column)) {
      throw new Error(`pagedQuery: unsafe column name "${column}"`);
    }
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  }

  let text = select.trim();
  if (conditions.length > 0) {
    text += ` WHERE ${conditions.join(" AND ")}`;
  }
  text += ` ORDER BY ${orderBy}`;

  if (pagination.limit) {
    values.push(pagination.limit);
    text += ` LIMIT $${values.length}`;
  }

  if (pagination.offset) {
    values.push(pagination.offset);
    text += ` OFFSET $${values.length}`;
  }

  return { text, values };
};
