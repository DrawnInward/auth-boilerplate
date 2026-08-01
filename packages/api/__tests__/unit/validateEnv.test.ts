import { collectEnvProblems, validateEnv } from "../../src/utils/validateEnv";

const REQUIRED_SECRETS = [
  "REFRESH_KEY",
  "USER_ACCESS_KEY",
  "ADMIN_ACCESS_KEY",
  "MFA_CHALLENGE_KEY",
  "MFA_ENCRYPTION_KEY",
];

const OPTIONAL_VARS = [
  "DATABASE_URL",
  "PGDATABASE",
  "PORT",
  "REFRESH_TOKEN_DAYS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "EMAIL_PROVIDER",
  "SENDGRID_API_KEY",
  "EMAIL_FROM",
];

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // A known-good baseline: every required secret set, every optional
    // integration unconfigured.
    process.env = { ...originalEnv };
    for (const name of REQUIRED_SECRETS) process.env[name] = "generated-secret";
    for (const name of OPTIONAL_VARS) delete process.env[name];
    process.env.PGDATABASE = "app_db";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("accepts a default install: secrets set, integrations unconfigured", () => {
    expect(collectEnvProblems()).toEqual([]);
    expect(() => validateEnv()).not.toThrow();
  });

  it.each(REQUIRED_SECRETS)("reports %s when it is missing", (name) => {
    delete process.env[name];

    expect(collectEnvProblems()).toEqual([
      `${name} is not set (run \`npm run setup\` to generate it)`,
    ]);
  });

  it("treats a whitespace-only secret as unset", () => {
    process.env.REFRESH_KEY = "   ";

    expect(collectEnvProblems()).toContainEqual(
      expect.stringContaining("REFRESH_KEY is not set"),
    );
  });

  it("reports every problem at once rather than the first", () => {
    delete process.env.REFRESH_KEY;
    delete process.env.MFA_ENCRYPTION_KEY;
    process.env.PORT = "-1";

    expect(collectEnvProblems()).toHaveLength(3);
  });

  describe("database", () => {
    it("accepts DATABASE_URL alone", () => {
      delete process.env.PGDATABASE;
      process.env.DATABASE_URL = "postgres://localhost/app";

      expect(collectEnvProblems()).toEqual([]);
    });

    it("requires one of DATABASE_URL or PGDATABASE", () => {
      delete process.env.PGDATABASE;

      expect(collectEnvProblems()).toEqual([
        "one of DATABASE_URL or PGDATABASE must be set",
      ]);
    });
  });

  describe("numeric knobs", () => {
    it.each([
      ["PORT", "0"],
      ["PORT", "-1"],
      ["PORT", "abc"],
      ["PORT", "3000.5"],
      ["REFRESH_TOKEN_DAYS", "0"],
      ["REFRESH_TOKEN_DAYS", "not-a-number"],
      ["BCRYPT_COST", "0"],
      ["BCRYPT_COST", "twelve"],
    ])("rejects %s=%s", (name, value) => {
      process.env[name] = value;

      expect(collectEnvProblems()).toEqual([
        `${name} must be a positive integer (got "${value}")`,
      ]);
    });

    it.each([
      ["PORT", "3000"],
      ["REFRESH_TOKEN_DAYS", "30"],
      ["BCRYPT_COST", "12"],
    ])("accepts %s=%s", (name, value) => {
      process.env[name] = value;

      expect(collectEnvProblems()).toEqual([]);
    });

    it("accepts an unset knob, which falls back to its default", () => {
      delete process.env.REFRESH_TOKEN_DAYS;

      expect(collectEnvProblems()).toEqual([]);
    });
  });

  describe("Google OAuth", () => {
    it("accepts all three set", () => {
      process.env.GOOGLE_CLIENT_ID = "id";
      process.env.GOOGLE_CLIENT_SECRET = "secret";
      process.env.GOOGLE_CALLBACK_URL = "http://localhost:3000/callback";

      expect(collectEnvProblems()).toEqual([]);
    });

    it("reports a partial config, which would silently disable sign-in", () => {
      process.env.GOOGLE_CLIENT_ID = "id";

      expect(collectEnvProblems()).toEqual([
        "Google OAuth is partially configured — set all of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL or none (missing: GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL)",
      ]);
    });
  });

  describe("email provider", () => {
    it("ignores SendGrid settings when the provider is not sendgrid", () => {
      process.env.EMAIL_PROVIDER = "console";

      expect(collectEnvProblems()).toEqual([]);
    });

    it("requires the SendGrid credentials when that provider is selected", () => {
      process.env.EMAIL_PROVIDER = "sendgrid";

      expect(collectEnvProblems()).toEqual([
        'SENDGRID_API_KEY is required when EMAIL_PROVIDER is "sendgrid"',
        'EMAIL_FROM is required when EMAIL_PROVIDER is "sendgrid"',
      ]);
    });

    it("accepts a fully configured SendGrid setup", () => {
      process.env.EMAIL_PROVIDER = "SendGrid";
      process.env.SENDGRID_API_KEY = "SG.key";
      process.env.EMAIL_FROM = "noreply@example.com";

      expect(collectEnvProblems()).toEqual([]);
    });
  });

  it("throws listing every problem", () => {
    delete process.env.REFRESH_KEY;
    delete process.env.PGDATABASE;

    expect(() => validateEnv()).toThrow(
      /Invalid environment configuration:\n {2}- REFRESH_KEY is not set[\s\S]*\n {2}- one of DATABASE_URL or PGDATABASE must be set/,
    );
  });
});
