# Platform uplift — progress and next steps

Working notes for the in-progress uplift that brings this boilerplate up to a
production platform standard: migrations, a services layer, structured logging,
shared contract types, and a full test harness on both sides.

**Everything below was done behaviour-preservingly.** The 480-test API suite is
the contract and passed green after every single step. If a change makes it go
red, the change is wrong, not the test.

---

## Where we got to

### Done

**File naming normalised.** All controllers are now `<name>.controller.ts`,
all routes `<name>.routes.ts` (including `adminRoutes.ts` → `admin.routes.ts`
and `userRoutes.ts` → `user.routes.ts`). 14 files renamed, 15 import sites
updated. The convention is universal — there are no grandfathered exceptions.

**SQL migrations.** Schema used to live as inline DDL inside `seed.ts`. It now
lives only in `packages/api/src/database/migrations/*.sql`, applied by
`database/migrate.ts` in filename order, each file in its own transaction and
recorded in a `migrations` table only on success. `seed()` drops the public
schema and replays migrations; it owns no DDL at all.

- `npm run migrate` applies pending migrations (safe to re-run, never drops).
- `npm run seed` is dev/test only: drop → migrate → fixtures.
- `build` copies `migrations/` into `dist`, since tsc doesn't move `.sql`.
- **Verified**: `pg_dump --schema-only` before and after the change was
  byte-identical across all 466 lines of DDL.
- **Migrations are immutable once merged.** Schema changes are always new
  numbered files appended at the end — never an edit to one that has run.

**Contract de-duplicated.** Six files existed in *both* `packages/shared/src/types`
and `packages/api/src/types`, and the API imported its own copies — they had
already drifted apart.

- `Mfa.ts`, `OAuth.ts`, `RouteParams.ts` were true duplicates: deleted from the
  API, which now imports them from `@auth-boilerplate/shared`.
- `User.ts` / `Admin.ts` correctly stay in both places. The API's copies carry
  `password_hash` and `mfa_secret` (internal row shapes); shared carries the
  `publicUser` / `publicAdmin` projections the frontend is allowed to see.
- **Two real bugs fixed**: shared's `invitationTypeSchema` was missing
  `admin_invite`, which the database CHECK constraint and the API both have — so
  parsing a genuine admin-invite row through the shared schema would have thrown.
  It now derives from an `INVITATION_TYPES` const array that mirrors the
  migration. A dead `MfaRequiredResponseSchema` also had its `message` field
  misspelt `masseag`.
- The API now **re-exports** its vocabularies (`invitationTypeSchema`,
  `orgInviteRoleSchema`, `authProviderSchema`, `createdThroughSchema`) from
  shared rather than re-typing them, so that class of drift can't recur.

**Platform utils** (`packages/api/src/utils/`) — each added because it had real
existing consumers, not speculatively:

| Util | What it replaced |
| --- | --- |
| `httpError` | 211 `throw { status, msg }` literals |
| `pgErrors` | 10 raw `err.code === "23505"` checks |
| `withTransaction` | 22 hand-rolled BEGIN/COMMIT/ROLLBACK/release blocks |
| `logger` (pino) | 26 `console.*` calls |
| `sqlPatch`, `envNumber` | available for new code |

`getValidatedQuery` was added to `middleware/validate.ts`, closing a real gap:
`validateQuery` was validating the query string and then **discarding** the
parsed result, with a comment telling controllers to re-read raw `req.query`.
Parsed output now goes to `res.locals.query`.

**Logging.** `pino-http` is wired in `app.ts` so every handler has `req.log`
carrying a request id. The error middleware owns error logging (5xx with stack,
4xx as warn) — don't log at the throw site as well. The only remaining
`console.*` are the two sanctioned exceptions: `ConsoleEmailProvider` (whose job
is printing emails) and the seed CLI.

**Transactions.** All 22 sites now use `withTransaction`. The two Google OAuth
handlers needed real restructuring rather than a mechanical swap — they had four
and two commit points respectively, committing at different branch outcomes.
They now return a tagged outcome (`mfa_required` / `needs_linking` /
`logged_in` / `created`) from the transaction, and the cookie-setting and
response selection happen after it. Only database work is inside the
transaction now.

**Test database separated.** `.env.test` and `.env.development` pointed at
`test_app_db` / `app_db`, which are shared with another project on this machine —
its tables were visible in the schema dump. They now point at
`test_authboilerplete_db` / `authboilerplete_db`. Those databases held stale
tables owned by a different role, which were cleared so `app_user` owns what it
creates.

---

## Next steps, in order

### 1. Services layer + composition root

There is no `services/` directory at all — business logic currently sits in
controllers. Create `services/` and the composition root `services/index.ts`:

- Factory functions closing over dependencies (`createXService(deps)`) — no
  classes, no `this` — instantiated once in the composition root.
- Move email sending behind a formal `EmailProvider` adapter with a
  deterministic test fake, swapped at the composition root. `utils/email` already
  has provider implementations; this makes it an adapter proper and establishes
  the pattern that anything talking to the outside world follows.

### 2. Frontend platform

**This is the biggest genuine gap: there are no frontend tests at all.**

- Build the test harness from zero: vitest + React Testing Library + MSW, with
  handlers validating payloads against the shared Zod schemas so tests break
  when the contract drifts.
- Add an `orgKeys` query-key factory; ban hand-built React Query key arrays.
- Confirm the three-tier component structure (`ui` / `shared` / `features`) and
  document the dependency direction (features → shared → ui, never back up).

### 3. CI gate

None of this exists yet — there is no prettier, no root eslint, no typecheck
script.

- Add prettier, root eslint config, `typecheck` and `test:web` scripts.
- The five-command gate: `format:check` (repo-wide), `typecheck` (all
  workspaces), `lint`, `test`, `test:web`.
- **Expect one enormous whitespace-only diff** the first time prettier runs
  across the repo. Do it as its own commit so it doesn't bury real changes. Only
  the files touched during this uplift have been formatted so far.
- Add a lint rule banning raw `client.query("BEGIN")` outside
  `utils/withTransaction.ts`, so the transaction rule is enforced rather than
  merely documented.

### 4. Deferred, needs a decision

- **`validateEnv`** (fail fast at boot on missing required env vars) was
  deliberately not written: *which* variables are required is a per-deployment
  question, and a boot check that fails on the wrong set is worse than none.
  Decide the required set first.
- **Response envelope inconsistency.** There are three pagination shapes:
  `paginationOptionsSchema` (model options), `paginationQuerySchema` (HTTP
  query), and `paginatedResponseSchema` (`{status, data, pagination}`). The
  existing list endpoints return the third. If a standard `{items, total}`
  envelope is wanted instead, that's a deliberate behaviour change with test
  updates in the same commit — not something to drift into.
- **`pagedQuery`** was deliberately not added. Its single-table `SELECT *` shape
  doesn't fit the existing list queries, which use JOINs. Add it when there's a
  query that actually fits.

---

## Working notes

- **Verify after every step**, not at the end: `npx tsc --noEmit` then
  `npm test`. Two bulk edits during this work put imports in the wrong place
  (one file had no imports at all; another had a multi-line import block) and
  typecheck caught both immediately.
- Bulk rewrites should assert their anchors matched exactly once and fail loudly
  otherwise. The 211-site `httpError` conversion used a brace-aware parser rather
  than a regex, because messages contain `}` and template literals contain
  `${...}` — a regex would have silently truncated objects.
- **Never modify existing test data** (`src/database/test-data/`). Multiple
  suites assert against those exact rows, emails and UUIDs. Add new fixtures
  instead.
