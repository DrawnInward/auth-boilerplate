// One source of truth for optional positive-number env knobs. Runtime callers
// degrade quietly — unset, empty, or malformed reads as null ("not configured")
// — while boot validation uses the same predicate to fail loudly on a malformed
// value, so runtime and boot can never disagree about what counts as valid.

export interface EnvNumberOptions {
  integer?: boolean;
  // Inclusive bounds for knobs whose consumer only accepts a range (e.g.
  // bcrypt's cost of 4–31); out-of-range counts as malformed.
  min?: number;
  max?: number;
}

const parsePositive = (
  raw: string,
  { integer = false, min, max }: EnvNumberOptions,
): number | null => {
  const value = Number(raw);
  const wellFormed = integer ? Number.isInteger(value) : Number.isFinite(value);
  if (!wellFormed || value <= 0) return null;
  if (min !== undefined && value < min) return null;
  if (max !== undefined && value > max) return null;
  return value;
};

export const readPositiveNumberEnv = (
  name: string,
  options: EnvNumberOptions = {},
): number | null => {
  const raw = process.env[name];
  if (!raw) return null;
  return parsePositive(raw, options);
};

// True only when the variable is set AND malformed — boot validation's "fail
// loudly" half of the contract above.
export const envSetButNotPositive = (
  name: string,
  options: EnvNumberOptions = {},
): boolean => {
  const raw = process.env[name];
  if (!raw) return false;
  return parsePositive(raw, options) === null;
};
