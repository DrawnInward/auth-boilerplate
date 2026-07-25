# Platform uplift — progress and next steps

Working notes for the uplift that brought this boilerplate up to a production
platform standard: migrations, a services layer, structured logging, shared
contract types, and a full test harness on both sides. **All of it has landed.**

**Everything below was done behaviour-preservingly.** The pre-existing 480-test
API suite is the contract and passed green after every single step — it now sits
at 587 tests, the 107 additions being new coverage, not edits. The web suite went
from nothing to 31 tests. If a change makes a suite go red, the change is wrong,
not the test.

Gate as it stands: `format:check`, `typecheck`, `lint` (0 errors, 63 warnings),
`test` (587), `test:web` (31) — all green.

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

**Contract de-duplicated.** Six files existed in _both_ `packages/shared/src/types`
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

| Util                    | What it replaced                                    |
| ----------------------- | --------------------------------------------------- |
| `httpError`             | 211 `throw { status, msg }` literals                |
| `pgErrors`              | 10 raw `err.code === "23505"` checks                |
| `withTransaction`       | 22 hand-rolled BEGIN/COMMIT/ROLLBACK/release blocks |
| `logger` (pino)         | 26 `console.*` calls                                |
| `sqlPatch`, `envNumber` | available for new code                              |

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

## The remaining steps, as completed

### 1. Services layer + composition root — done

`services/` and the composition root `services/index.ts` now exist, holding
`createEmailService(deps)` — a factory closing over its dependencies, no classes,
no `this`, instantiated exactly once.

Email became a proper adapter in the process. It previously had no injection
seam at all: each template called `sendEmail`, which called `getEmailProvider()`
internally, so nothing could observe or substitute it — which is why **no test
touched email before this**.

- The eight templates are now **pure builders** (`buildVerificationEmail` etc.)
  returning `EmailOptions`, taking `appName`/`frontendUrl` as arguments rather
  than reading env. `textToHtml` likewise takes `appName`. No IO, so the copy is
  unit-testable.
- `createEmailService({ provider, appName, frontendUrl })` renders and sends.
  Controllers call `services.email.sendVerification(...)`; none of them import a
  template or a provider any more.
- `MemoryEmailProvider` is the adapter's deterministic fake — it records what it
  was handed. 18 unit tests now assert recipients, branding, links and HTML
  escaping.
- `sendEmail.ts` was deleted: with the service in place it was dead, and leaving
  it would have offered a way to bypass the seam.
- **One copy bug fixed on the way through.** The org-invite template built
  `"You have been" + " invited you to join"` when no inviter was known, i.e.
  "You have been invited **you** to join". The two branches needed different verb
  forms; the clause is now built whole. The inviter-known wording is unchanged.

### 2. Frontend platform — done

- Harness built from zero: vitest + RTL + MSW (`packages/web/src/test/`). MSW
  handlers parse request bodies with the **shared Zod schemas**, so a contract
  drift fails a test; `handlers.test.ts` guards that this validation stays wired.
  Unhandled requests error rather than hang.
- `orgKeys` factory added and adopted; `organizations.ts` and `invitations.ts` no
  longer hand-build a key. Its tests assert the invalidation _hierarchy_ through
  React Query itself, not by comparing arrays.
- 31 tests, aimed where the testing conventions say value lies: permission gating
  (owner/admin vs member/viewer in `MembersList`, including the never-edit-the-
  owner and never-edit-yourself rules), redirect logic (`ProtectedRoute`,
  including the don't-redirect-while-loading case that bounces logged-in users on
  refresh), and async loading/empty states.
- `LoadingSpinner` gained `role="status"` + `aria-label`. It had no accessible
  name, so a loading state could only be detected by class name — which the
  testing rules forbid. Visually unchanged.

### 3. CI gate — done

- prettier (`.prettierrc.json`, `.prettierignore`) + `format`/`format:check`.
- Single root `eslint.config.mjs` covering all three workspaces; the web-only
  config was removed. `eslint-config-prettier` last in every chain.
- `typecheck` per workspace, aggregated at root; `test:web` at root.
- **The repo-wide prettier run touched 126 files.** It is whitespace-only apart
  from markdown list spacing and JSON reflow in `docs/`, and belongs in its own
  commit so it doesn't bury the rest.
- The `client.query("BEGIN")` ban is in place as `no-restricted-syntax`, exempt
  in `withTransaction.ts` and `migrate.ts` (one transaction per migration file),
  and in `__tests__/` — the CRUD suites drive BEGIN/ROLLBACK deliberately, to
  prove models honour an injected client and to leave the test DB untouched.
- Lint sits at 0 errors / 63 warnings. The warnings are
  `@typescript-eslint/no-explicit-any` on caught pg errors and row shapes, plus
  `react-refresh/only-export-components` on the shadcn primitives, which are
  regenerated by `npx shadcn add` and so cannot satisfy it.

### 4. Previously deferred — now decided

- **`validateEnv`** is written and called in `server.ts` before `listen`. The
  required set was the open question; it is answered by taking exactly what
  `setup.ts` generates: `REFRESH_KEY`, `USER_ACCESS_KEY`, `ADMIN_ACCESS_KEY`,
  `MFA_CHALLENGE_KEY`, `MFA_ENCRYPTION_KEY`, plus one of
  `DATABASE_URL`/`PGDATABASE`. Optional integrations are only checked once
  something opts into them, so a default install stays valid — but a _partial_
  opt-in fails, because a half-configured Google OAuth silently disables sign-in
  and a keyless SendGrid silently logs to console instead of sending. Numeric
  knobs reuse `envNumber`'s predicate, so boot and runtime cannot disagree about
  what is valid. Verified both ways: an unset secret exits 1 before listening,
  and a normal boot still serves.
- **`pagedQuery`** is added. The original objection — "its single-table
  `SELECT *` shape doesn't fit queries that JOIN" — was a property of the assumed
  design, not the need. Taking `select` as a caller-supplied code literal
  (optionally including JOINs) and binding only `equals` values fits all eight
  existing list functions, which are now converted; `paramIndex` no longer
  appears anywhere in `models/`. It preserves the old falsy-check semantics, so
  `offset: 0` still means "from the start" rather than `OFFSET 0`.
- **`buildPatch`** had been written but had **zero consumers** — the three
  `modify*` models still hand-counted placeholders. All three now use it. Its
  empty-patch throw was changed from a plain `Error` to
  `httpError(400, "No valid fields to update")`, which is what those models
  already did and what `organizationCRUD.test.ts` pins.
- **`readPositiveNumberEnv`** was likewise unused. `getRefreshTokenDays` now uses
  it instead of its own `parseInt`, which also stops `REFRESH_TOKEN_DAYS=0` or
  `-5` being accepted as a refresh window.
- **`jest.env.ts`** was documented as existing but did not, nor did its
  `setupFiles` entry — so a developer's untracked `.env` could change what the
  suites asserted. Both added, and confirmed load-bearing: with
  `ORG_CREATION_MODE=admin_only` in the environment, 11 tests fail without it and
  pass with it.
- **Response envelope inconsistency** is still open and still needs a decision.
  Three pagination shapes coexist: `paginationOptionsSchema` (model options),
  `paginationQuerySchema` (HTTP query), and `paginatedResponseSchema`
  (`{status, data, pagination}`), which is what the list endpoints return. Moving
  to a standard `{items, total}` envelope is a deliberate behaviour change with
  test updates in the same commit — not something to drift into.

### 5. Found by auditing the rules against the code — now fixed

Three things the architecture rules prescribed were not actually true of the repo:

- **Query validation was entirely unwired.** `validateQuery` and
  `getValidatedQuery` had **zero consumers**, and `paginationQuerySchema` /
  `organizationsQuerySchema` in shared were unused, while seven controllers
  hand-rolled `parseInt(req.query.limit as string)` into a `pagination: any`.
  `parseInt("-5")` is truthy, so `?limit=-5` reached SQL as `LIMIT -5`, which
  Postgres rejects — **every list endpoint answered 500**, verified against a
  running app. `?limit=abc` was silently ignored and `?limit=999999` uncapped,
  despite the shared schema's `max(100)`.

  All six paginated routes now apply `validateQuery`, and their controllers read
  `getValidatedQuery<T>(res)`. A new `usersQuerySchema` covers the admin user
  filters; its booleans go through a `queryBooleanSchema` rather than
  `z.coerce.boolean()`, which is wrong for query strings because
  `Boolean("false")` is `true` — previously `?is_active=yes` filtered for
  _inactive_ users. Bad input is now a 400: `-5`, `0`, `abc`, `101` all rejected,
  `limit=2` still works, `offset=0` still means "from the start". 52 tests in
  `listQueryValidation.test.ts` cover it. The `any` casts went with it.

- **The frontend layering rule was being broken.** `useAuth` was imported from
  `features/auth/context/` by the dashboard, organizations and settings features,
  and `admin` imported `MfaVerifyForm` from `features/auth/components` — the rule
  says a feature never reaches into another's internals, and that a hook is
  promoted once a second feature needs it. `AuthProvider` now lives in
  `src/context/AuthContext.tsx`, `useAuth` in `src/hooks/useAuth.ts`, and
  `MfaVerifyForm` in `components/shared/`. Cross-feature imports are now zero,
  and `components/` imports no feature.

- **`loginAs` was documented but did not exist.** Every integration suite
  hand-rolls the login and cookie extraction, and a typo'd fixture email yields
  `undefined` cookies that surface later as a puzzling 401. `__tests__/helpers/`
  now holds `loginAs` / `loginAsAdmin`, which throw naming the account instead.
  Jest's `testMatch` had to stop treating every file under `__tests__` as a suite
  first. The new spec uses it; the pre-existing suites deliberately still log in
  inline, since they are the contract and a sweep would rewrite all eleven.

### 6. Path params typed from their schemas

The counterpart to the query fix, found by asking why five shared types had no
consumers. Controllers read path params through 35 `as string` casts —
`req.params.organizationId as string` — because `RequestWithUser` was not generic,
so `req.params` fell back to Express 5's `ParamsDictionary`, whose index signature
is `string | string[]` (widened for splat routes). The cast asserted the union
away.

This deliberately did **not** copy the query solution. `res.locals.query` exists
only because Express 5 made `req.query` a read-only getter; `req.params` has no
such problem — verified that `validateParams`' parsed output reaches the handler,
through a mounted sub-router, transforms included. A `getValidatedParams` would
have been machinery for a constraint that does not apply, plus a second home for
validated data.

Instead `RequestWithUser<P = ParamsDictionary>` is generic, and handlers declare
the type inferred from the same schema their route validates with:

```ts
export const getMembers = async (req: RequestWithUser<OrganizationParams>, …) => {
  const organizationId = req.params.organizationId; // string, derived not asserted
```

- All 35 casts gone; every handler mapped to the schema its own route applies, not
  to a guess.
- The five formerly-dead shared types (`OrganizationParams`,
  `OrganizationMemberParams`, `OrganizationInvitationParams`, `UserParams`,
  `TokenParams`) are now the single source for both the runtime schema and the
  controller type.
- `/api/auth/verify/:token` and `/api/auth/confirm-email-change/:token` had **no**
  `validateParams` at all, so annotating them would have been a false claim.
  They now validate `tokenParamsSchema`, matching the invitation routes.
  Behaviour-neutral: the schema is `min(1)`, and Express cannot match an empty
  path segment anyway.
- The default generic stays `ParamsDictionary` rather than the flat variant on
  purpose: dropping an annotation reintroduces the union and **fails the build**,
  which is the pressure a repo-wide `ParamsFlatDictionary` default would remove.
  Confirmed by deleting one annotation and watching tsc reject it.

### 7. Dead exports — audited, mostly left alone

An occurrence audit (flagging exports whose only appearance is their own
declaration) finds 18 across the repo. Almost all are pre-existing and defensible
in a boilerplate: `packages/shared` is a contract package, so `ErrorResponse`,
`SetPasswordDto`, `paginatedResponseSchema` and friends have legitimate external
consumers even with none internally. `requireOrgViewer`, `sendNoContent`,
`isCheckViolation` and `isNotNullViolation` are guards and helpers awaiting a
first caller.

Two findings worth recording rather than fixing:

- **`isHttpError` is unused, and wiring it in would regress.** Its docstring
  suggests it is the error middleware's shape check, but `handleCustomError`
  tests `if (error.status)` instead. Those are not equivalent: `isHttpError`
  additionally demands a string `msg`, which body-parser errors do not carry.
  Verified — a malformed JSON body currently answers 400, and `isHttpError`
  returns `false` for that error, so the swap would turn it into a 500. Left as
  an available predicate.
- **The four `Validated*Request` types in `shared/src/types/Organization.ts` are
  hand-written**, not derived from any schema, which the type-placement rule
  forbids. They are also unused. They want deleting, or replacing with
  schema-derived equivalents — a contract change, so not folded into this work.

### 8. Still open

- Admin and auth query keys (`["admin", "users", …]`, `["me"]`) are still
  hand-built. Only the org namespace has a factory; each of the others wants the
  same treatment when next touched.
- `npm audit` reports pre-existing vulnerabilities in the dependency tree,
  untouched by this work and worth a separate look.
- `oauth.controller.ts` reads `req.query` directly for the Google callback's
  `code`/`state`. It is a redirect target, not a list endpoint: a malformed
  callback should probably redirect with an error rather than return a 400, so it
  wants a deliberate decision rather than the same treatment.

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
