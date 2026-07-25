// A jest `setupFiles` entry: runs before the test framework and before any
// module — and therefore before any module's pathless `dotenv.config()` — is
// loaded. dotenv never overwrites a variable that is already set, so pinning the
// creation modes to their `open` defaults here keeps a developer's untracked
// .env from leaking into the suites and changing what they assert.
//
// Mode-specific behaviour is tested by assigning process.env per-test; see
// __tests__/integration/orgCreationModes.test.ts.
process.env.ACCOUNT_CREATION_MODE = "open";
process.env.ORG_CREATION_MODE = "open";
