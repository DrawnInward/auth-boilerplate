// One source of truth for optional positive-number env knobs. Runtime callers
// degrade quietly — unset, empty, or malformed reads as null ("not configured")
// — while boot validation uses the same predicate to fail loudly on a malformed
// value, so runtime and boot can never disagree about what counts as valid.

const parsePositive = (raw: string, integer: boolean): number | null => {
  const value = Number(raw);
  const wellFormed = integer ? Number.isInteger(value) : Number.isFinite(value);
  return wellFormed && value > 0 ? value : null;
};

export const readPositiveNumberEnv = (
  name: string,
  options: { integer?: boolean } = {},
): number | null => {
  const raw = process.env[name];
  if (!raw) return null;
  return parsePositive(raw, options.integer ?? false);
};

// True only when the variable is set AND malformed — boot validation's "fail
// loudly" half of the contract above.
export const envSetButNotPositive = (
  name: string,
  options: { integer?: boolean } = {},
): boolean => {
  const raw = process.env[name];
  if (!raw) return false;
  return parsePositive(raw, options.integer ?? false) === null;
};
