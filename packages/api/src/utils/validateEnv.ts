// Boot-time environment validation. Every secret checked here is otherwise
// discovered at request time as a 500 (see authoriseUser, encryption,
// mfaChallenge, refresh.models) — this turns a misconfigured deploy into one
// loud failure at startup instead of a class of runtime errors.
//
// The required set is exactly what `setup.ts` generates; optional integrations
// (Google OAuth, SendGrid) are only checked once something opts into them, so a
// default install stays valid. Numeric knobs reuse envNumber's predicate, so
// "well-formed" can never mean one thing here and another at the read site.

import { envSetButNotPositive } from "./envNumber";

const REQUIRED_SECRETS = [
  "REFRESH_KEY",
  "USER_ACCESS_KEY",
  "ADMIN_ACCESS_KEY",
  "MFA_CHALLENGE_KEY",
  "MFA_ENCRYPTION_KEY",
] as const;

// BCRYPT_COST additionally carries bcrypt's own hard cost range: anything
// outside 4–31 either throws in the bcrypt library or (e.g. a typo like 120)
// boots clean and then makes every hash take effectively forever.
const POSITIVE_INTEGER_KNOBS: readonly {
  name: string;
  min?: number;
  max?: number;
}[] = [
  { name: "PORT" },
  { name: "REFRESH_TOKEN_DAYS" },
  // Grace is SECONDS with a hard cap: a units typo (30000 "ms") would pass a
  // positive-integer check and silently disable replay breach detection.
  { name: "REFRESH_REUSE_GRACE_SECONDS", min: 1, max: 300 },
  { name: "ACCESS_TOKEN_LIFETIME_SECONDS" },
  { name: "BCRYPT_COST", min: 4, max: 31 },
];

const GOOGLE_OAUTH_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
] as const;

const isSet = (name: string): boolean =>
  (process.env[name] ?? "").trim().length > 0;

export const collectEnvProblems = (): string[] => {
  const problems: string[] = [];

  for (const name of REQUIRED_SECRETS) {
    if (!isSet(name)) {
      problems.push(
        `${name} is not set (run \`npm run setup\` to generate it)`,
      );
    }
  }

  if (!isSet("DATABASE_URL") && !isSet("PGDATABASE")) {
    problems.push("one of DATABASE_URL or PGDATABASE must be set");
  }

  for (const { name, min, max } of POSITIVE_INTEGER_KNOBS) {
    if (envSetButNotPositive(name, { integer: true, min, max })) {
      const requirement =
        min !== undefined && max !== undefined
          ? `an integer between ${min} and ${max}`
          : "a positive integer";
      problems.push(
        `${name} must be ${requirement} (got "${process.env[name]}")`,
      );
    }
  }

  // Partial OAuth config silently disables Google sign-in rather than failing,
  // so it has to be caught here or not at all.
  const configuredGoogleVars = GOOGLE_OAUTH_VARS.filter(isSet);
  if (
    configuredGoogleVars.length > 0 &&
    configuredGoogleVars.length < GOOGLE_OAUTH_VARS.length
  ) {
    const missing = GOOGLE_OAUTH_VARS.filter((name) => !isSet(name));
    problems.push(
      `Google OAuth is partially configured — set all of ${GOOGLE_OAUTH_VARS.join(", ")} or none (missing: ${missing.join(", ")})`,
    );
  }

  // Likewise, an unusable SendGrid config falls back to logging emails to the
  // console, which in production means silently sending nothing.
  if ((process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase() === "sendgrid") {
    for (const name of ["SENDGRID_API_KEY", "EMAIL_FROM"]) {
      if (!isSet(name)) {
        problems.push(`${name} is required when EMAIL_PROVIDER is "sendgrid"`);
      }
    }
  }

  return problems;
};

export const validateEnv = (): void => {
  const problems = collectEnvProblems();
  if (problems.length === 0) return;

  throw new Error(
    `Invalid environment configuration:\n${problems
      .map((problem) => `  - ${problem}`)
      .join("\n")}`,
  );
};
