# Auth-boilerplate hardening plan

Upstream work, ordered for execution. Every item is generic platform work — no billing,
nothing that can't be justified without mentioning money, so all of it lands in the public
`auth-boilerplate` and merges down into the fork. Written 2026-07-29.

Guiding rule for the whole plan: **each behaviour change ships with the test that proves it,
and the pre-existing 587-test suite stays green after every step.** A step that reddens an
existing suite is wrong until proven otherwise — that suite is the contract.

---

## Phase A — Security fixes

Each fix below is: the issue (stated and sense-checked), the solution, and how it's tested.
Severity is my honest ranking. S1 and S2 are the two I'd treat as must-fix-before-anything-else;
S2 additionally touches `invitations.controller.ts`, one of the six seat-policy hook sites, so
it must be clean **before** billing hooks land there.

### A1 · S1 — Concurrent refresh revokes every session (HIGH, reproduced)

**Issue (confirmed empirically).** Refresh rotation happens inside `authoriseUser` middleware
(`middleware/authoriseUser.ts:51-60`), triggered whenever the access token has expired. Two
requests arriving together after the 10-minute access-token lifetime both carry the same
refresh cookie. Request A rotates it (marks `used_at`, issues a new token); request B waits on
the `FOR UPDATE` lock (`refresh.models.ts:48`), wakes, sees `used_at` set, and hits the
reuse-detection branch — which calls `revokeUserTokens` and deactivates **all** of that user's
tokens, on every device (`refresh.models.ts:162-172`). Proven with a two-request `Promise.all`:
a separate second login was force-logged-out because the first device raced. The reuse-detection
logic is correct and worth keeping; the trigger is wrong — normal browser concurrency is
indistinguishable from theft. This is why it isn't seen in click-through testing: you have to be
idle past 10 minutes, then fire two calls at once, which is exactly what an SPA does on first
load after a break.

**Solution (two parts, both standard "reuse detection with leeway").**

1. **Extract rotation into a dedicated `POST /auth/refresh` endpoint.** Middleware stops
   rotating — it only verifies the access token and returns 401 on expiry. The web `api/client`
   gets a **single-flight** refresh: on a 401, one refresh call is made, concurrent callers await
   the same promise, then all retry. This removes the _common_ cause (N parallel requests each
   rotating). The endpoint is already documented in `api-reference.md` and doesn't exist — this
   also closes that drift.
2. **Server-side grace window (defence in depth).** Add a nullable `replaced_by` column to
   `refresh`. When a token is rotated, record the child's id on the parent. In `createAccessToken`,
   if a presented token has `used_at` set but within a short leeway (e.g. 30s) **and** has a
   `replaced_by`, return the child's session instead of revoking — the reuse was a client race,
   not theft. Only revoke-all when the reuse is outside the leeway or the token has no recorded
   child (genuine replay of an old token). This makes a slipped race idempotent instead of
   catastrophic.

**Tests.**

- Integration: two concurrent requests to `/auth/refresh` with the same cookie → both succeed
  (or one succeeds and one gets the child), and a _separate_ device's token stays active. This is
  the reproduction test, inverted into an assertion.
- Integration: replay of a genuinely old token (used, outside leeway) → 401 **and** all tokens
  revoked (the real-theft path still works).
- Web: unit test the single-flight client — 3 hooks fire while unauthenticated, exactly one
  refresh request goes out, all three retry.

**Decision point:** leeway length (30s is typical). Note it in the conventions doc.

**Reviewed (2026-07-29) — clean, two accepted observations.** A security pass and an adversarial
correctness pass both cleared the grace-window logic (logout hole closed, breach detection intact,
no self-deadlock, no key-reuse via the MFA_CHALLENGE_KEY fallback because both verifiers check a
`type` claim). Two non-blocking observations, both to revisit in the Phase C authService walk, not
now: (a) the mint-per-race path can leave untracked-but-valid child tokens (inherent to
mint-per-race; single-flight reduces it); (b) `successorActive` checks only the immediate
successor, so if that successor is itself rotated inside the same grace window a late sibling
holding the parent gets a spurious retriable 401 — the conservative check is deliberate (the cheap
relaxation would reopen the logout hole), and the robust fix is a lineage walk. Documented at the
call site.

**Status (2026-07-29) — grace window DONE; endpoint + single-flight deferred to Phase C.**
Implemented part 2 (the correctness fix): migration `002_refresh_replaced_by.sql` adds the
`replaced_by` self-reference; `createAccessToken` honours a reused token only when it is inside
`REFRESH_REUSE_GRACE_SECONDS` (default 30, validated at boot) **and** its successor is still
active — so a concurrent race is honoured but a rotated-then-revoked lineage (logout, breach) is
never resurrected. The mass-logout bug is gone, proven by an inverted reproduction test (two
concurrent refreshes → both 200, session survives) plus CRUD tests for within-grace reuse,
outside-grace breach, and revoked-successor rejection. Part 1 (dedicated `POST /auth/refresh` +
client single-flight) is deliberately **deferred to Phase C (authService)**: it restructures
`authoriseUser` (every route) and the web client (every call) — exactly the surface authService
reworks — so doing it now then again in C is duplicated blast radius. The grace window alone
closes the security/UX bug; single-flight is efficiency and is best paired with the extraction.

**Status (2026-08-05) — part 1 DONE; A1 fully closed.** `POST /api/auth/refresh` now exists:
public, rate-limited, and shared by both roles — the refresh cookie is the credential and names
its principal, so admin sessions rotate at the same endpoint (covered in `adminAuth.test.ts`).
`authoriseUser` no longer touches refresh tokens at all: a missing/expired/malformed access token
is a clean 401 `Credentials missing` with no rotation side effects, and the per-cause refresh
statuses the A6 note deferred now surface at the endpoint (revoked / breach-replay / expired /
inactive-account 401s, forged token 401). The web `api/client` gained the single-flight exchange:
any number of concurrent 401s produce exactly one refresh call which every caller awaits, then
retries once — safe for all verbs because the 401 came from the middleware, before any handler
ran. The plan's three tests all exist: concurrent refresh → both 200 and a separate device's
session untouched; outside-grace replay (via a backdated `used_at`) → 401 breach **and** the
successor lineage revoked; web single-flight (three concurrent callers, one refresh request, all
three retry) plus refresh-failure fallthrough and non-401 passthrough. A fourth pins the grace
nuance: a rotated-then-logged-out lineage is refused even inside the reuse window. Specs that
drove rotation through the middleware (`userAuth`, `adminUsers` S4, `selfAccount`,
`passwordReset`) now exercise the endpoint; `roleBoundary` classifies `/refresh` public. The
`api-reference.md` drift (documented-but-nonexistent endpoint) is closed by existence; the doc
itself still regenerates under D5. Gate: 934 API tests (41 suites), 55 web.

**Reviewed (2026-08-05) — clean after three fixes from the pass.** A security and a correctness
review over the working tree found no vulnerability but three items, all fixed and tested:
(1) `/refresh` initially shared `authLimiter`'s 10-hit budget — steady-state refresh traffic
would have starved login; it now has its own `refreshLimiter` (120/15 min). (2) The client
retried **any** 401, including handler-minted ones — a wrong login password would silently
re-submit, and a wrong MFA code would double-count against the 5-attempt budget when a live
refresh cookie coexisted; the retry now fires only on the middleware's uniform
`Credentials missing` 401, pinned by a web test. (3) A validly-signed token whose row was gone
surfaced the model's 404 — normalised to the same 401 as a forged token, pinned by an
integration test. Deferred to D6: the `trust proxy` posture (unset, so reverse-proxy deployments
key every rate limit to the proxy IP), and the claims drift where rotation mints 10-minute
`{role_id, role_type}` access tokens while `issueSession` mints 15-minute tokens carrying
`root`/`email_verified` — nothing reads those claims server-side today, but the refresh path is
now the dominant minting path and belongs in the authService fold-in.

### A2 · S2 — MFA bypass via invitation accept (HIGH, touches a hook site)

**Issue.** `POST /invitations/:token/accept` for an existing user verifies the invite token and
password, then mints full session cookies directly (`invitations.controller.ts:283-305`) — no
MFA challenge, and no `is_active` check. Login, OAuth login and OAuth linking all divert to the
MFA challenge when `mfa_enabled`; this path doesn't. An attacker who knows a target's password
(the exact thing MFA defends) and can get an invite mailed to that address skips the second
factor, and a deactivated user can re-enter.

**Solution.** After the password check in the existing-user branch, mirror login exactly: load
MFA status and `is_active`; if inactive → 403; if MFA enabled → issue an MFA challenge cookie and
return `{ mfa_required: true }` **without** session cookies. Reject the login half; the org-join
half is the design decision below.

**Decision point (surface it, don't guess).** When an MFA-enabled existing user accepts an invite,
do we (a) complete the org-join immediately — they proved password + token possession, MFA gates
only the _session_ — and then require MFA to get logged in, or (b) defer the org-join until MFA
completes, carrying the pending invitation through the challenge? (a) is simpler and defensible
(membership ≠ authentication); (b) is stricter. Recommend (a): mark invitation used + add member
inside the transaction, issue the challenge instead of cookies. The existing challenge-verify
endpoint then logs them in normally.

**Tests.**

- Integration: existing MFA-enabled user accepts invite → 200 `mfa_required`, **no** session
  cookie set, and completing the challenge then yields a session.
- Integration: deactivated user accepts invite → 403.
- Integration: existing non-MFA user still accepts in one shot (unchanged behaviour).
- Integration: new user accept path unchanged.

**Status (2026-07-29) — DONE (decision (a) taken).** `acceptInvitation` now returns a
discriminated outcome: an MFA-enabled existing user gets an MFA challenge cookie and
`{ mfa_required: true }` with **no** session cookies, and a deactivated account is rejected 403 —
both mirroring login. The org-join commits regardless (membership ≠ authentication). Covered by
two new integration tests (MFA-enabled → mfa_required, no session, membership still created;
deactivated → 403); the existing non-MFA and new-user accept tests stay green unchanged. The call
site remains a thin controller, keeping the seat-policy hook that will live here uncomplicated.

### A3 · S3 — Forgeable `oauth_pending` cookie hijacks accounts (HIGH)

**Issue.** The Google callback stores `{ google_id, email }` in an `oauth_pending` cookie as
**plain base64** (`oauth.controller.ts:194-196`) — encoding, not signing. The unauthenticated link
route trusts it verbatim (`:248-250`): it finds the user by the cookie's `email`, checks the
password, and writes the cookie's `google_id` onto that account. So a user can forge the cookie
with _someone else's_ google_id and bind that Google identity to their own account; the victim's
future "Sign in with Google" then resolves into the attacker's account.

**Solution.** Sign the pending payload as a short-lived JWT (reuse the existing key pattern; a
dedicated `OAUTH_STATE_KEY` added to `validateEnv`, or reuse `MFA_CHALLENGE_KEY`'s approach).
The link handler `jwt.verify`s it, so only server-issued `{google_id, email}` from a real Google
callback are ever accepted. google_id can no longer be swapped.

**Tests.**

- Integration: link with a hand-crafted base64 cookie → 401/400 (rejected).
- Integration: link with a tampered (re-signed-with-wrong-key) cookie → rejected.
- Integration: the genuine callback→link happy path still works (mock the Google util as the
  existing OAuth suite does).

**Status (2026-07-29) — DONE.** New `utils/oauthPending.ts` signs the pending payload as a
short-lived JWT (key `OAUTH_STATE_KEY`, falling back to the required `MFA_CHALLENGE_KEY` so a
default install needs no new env). `handleGoogleCallback` signs; `linkGoogleAccount` verifies, so
only a server-issued `{ google_id, email }` from a real callback is accepted. Covered by a new
test that a forged base64 `oauth_pending` cookie is rejected 400; the existing genuine
callback→link test proves sign→verify round-trips.

### A4 · S4 — Deactivated/deleted users keep working sessions (HIGH)

**Issue.** Nothing re-checks `is_active`/`deleted_at` after the initial login. Admin disable and
delete (`adminUsers.controller.ts:151-165`) never revoke tokens, and each refresh mints a fresh
7-day token, so a banned user with an open tab keeps access indefinitely.

**Solution.**

1. Call `revokeUserTokens(userId, "user")` inside the admin disable and delete transactions.
2. In `createAccessToken` (the refresh path), re-load the principal and reject + revoke if
   `is_active` is false or `deleted_at` is set. Bounds the residual window to the access-token
   lifetime (~10 min) — the accepted trade-off of stateless access tokens.

**Tests.**

- Integration: admin disables a logged-in user → that user's next request fails after refresh.
- Integration: admin deletes a user → tokens revoked.
- CRUD/unit: `createAccessToken` refuses an inactive principal.

**Status (2026-07-29) — DONE.** Both admin `updateUser` (when `is_active` goes false) and
`deleteUserHandler` now revoke the user's tokens inside their transaction. `createAccessToken`
additionally re-loads the principal on every refresh and refuses (`401 Account is no longer
active`) if it is missing/deleted or inactive — a defensive gate that also stops a reactivated
account inheriting old sessions. Two integration tests (deactivate → refresh 403, delete →
refresh 403). Note: the principal check surfaced that `refreshCRUD` was minting an admin token
for an admin it never seeded — the exact "issue a token for a principal that may not exist" gap
S4 closes — so that suite now seeds `adminsData`.

### A5 · S8 — MFA disabled with no password (MEDIUM)

**Issue.** `mfaDisableSchema` is `{ code }` only (`shared/types/Mfa.ts:21-25`); disable accepts a
TOTP _or_ a backup code, no password (`user/mfa.controller.ts:149-168`, admin identical). The API
reference claims it requires password + TOTP. Disabling a second factor is the classic step-up
operation; a stolen session + one leaked backup code silently removes MFA.

**Solution.** Add `password` to `mfaDisableSchema` (shared, single source). Both disable handlers
verify the password **and** a current TOTP/backup code before disabling. Keep the existing
notification email.

**Tests.** Integration (user + admin): disable without password → 400/401; with wrong password →
401; with password + code → 200. Update the one existing disable test to the new contract.

**Status (2026-08-01) — DONE.** `mfaDisableSchema` gains a required `password` (shared, so the
SecurityTab form validates with the same contract). Both disable handlers verify the password
before the code check: wrong password → 401 "Invalid password" (MFA stays enabled — asserted);
a passwordless OAuth user → 400 "No password set. Use set-password endpoint instead." (same
message as change-password); admins always have a password so no such branch. New
`getAdminWithPasswordById` mirrors the user model's lookup. SecurityTab's disable dialog gains
the password field — and loses its `maxLength={6}` on the code input, which had made
backup-code entry (9 chars) impossible there despite the endpoint accepting them. Specs
updated/added in `userMfa.test.ts` (+3) and `adminMfa.test.ts` (+2). Phase A is now fully
closed; the suite freezes here for Phase C.

### A6 · S7 + the 0.3 straggler — unguarded decode & non-standard error shape (MEDIUM, cheap)

**Issue.** `authoriseUser` base64-decodes and `JSON.parse`s the access cookie _before_ its try
block (`:19-29`) — one malformed cookie 500s every request from that browser until cleared. Same
file emits `{ msg }` error bodies (`:37,73,77`) bypassing the error middleware, so auth failures
are the one response shape a client can't parse uniformly.

**Solution.** Move the decode inside a try; on any parse failure treat the token as absent (401).
Replace the three `res.status().send({msg})` with `throw httpError(401/403, …)` caught by the
error middleware, so the envelope matches everywhere.

**Tests.** Integration: garbage `access_token` cookie → clean 401, not 500. Assert the error body
is the standard `{ status, message }` envelope.

**Status (2026-07-31) — DONE.** The access-cookie decode now lives inside a try: a cookie that
doesn't parse is treated as absent, falling through to the refresh cookie if present, else a clean 401. The three `res.status().send({msg})` sites route through `next(httpError(...))` so every auth
failure now wears the standard `{ status: "error", message }` envelope. One deliberate nuance in
the catch: a deliberate 5xx (`Missing environment variable`) is forwarded as-is instead of being
flattened — previously a misconfigured server masqueraded as `403 Invalid Token` — while all
verify/rotation failures still flatten to one 403 so the response doesn't reveal which check
failed (per-cause refresh statuses are a Phase C concern, alongside the dedicated endpoint).
Three new integration tests (garbage cookie → 401 + envelope; non-JSON payload segment → 401;
malformed access cookie + valid refresh cookie → falls through and succeeds); the fourteen
existing `body.msg` assertions updated to the standard envelope.

### A7 · S9 — MFA challenge replayable in its window (MEDIUM-LOW)

**Issue.** The 5-minute challenge JWT has no `jti` and no server record; clearing only clears the
client copy, and a failed verify leaves it valid (`utils/mfaChallenge.ts`). A captured cookie can
be retried for the whole window.

**Solution.** Add a `jti` to the challenge, persist it (small `mfa_challenges` table or a reuse of
the refresh-style store), consume on successful verify and after N failed attempts. Can follow A1–A6.

**Tests.** Integration: replaying a consumed challenge → 401; challenge invalidated after N fails.

**Status (2026-07-31) — DONE (dedicated table chosen).** Migration `003_mfa_challenges.sql` adds
`mfa_challenges` (`jti` PK, role, `expires_at`, `consumed_at`, `failed_attempts`); a dedicated
table rather than overloading `refresh`, whose rotation/grace logic must never see challenge rows.
`createMfaChallengeToken` now mints a `jti` and persists the row itself — a challenge that isn't
recorded can never be verified, at any current or future call site — and opportunistically deletes
expired rows. All four verify sites (user/admin × TOTP/backup) run the same trio from
`utils/mfaChallenge.ts`: `guardMfaChallenge` (missing/consumed/exhausted → 401) before the code
check, `failMfaChallenge` on a wrong code (deliberately on the pool so a transaction rollback
cannot erase the count), and `consumeMfaChallengeOrThrow` (compare-and-set, so of two concurrent
verifies exactly one issues a session) before the session. Cap is
`MFA_CHALLENGE_MAX_ATTEMPTS = 5`. Covered by a new CRUD suite (defaults, single consume,
exhausted-attempts refusal, expiry cleanup) and three integration tests: replayed consumed
challenge → 401, correct code refused after 5 failures, and failed backup-code attempts counting
against the same budget. Row shape lives in `types/MfaChallenge.ts` as a plain interface (not a
Zod schema — nothing validates it at an edge).

- **S5 enumeration:** register / admin-invite / email-change return 409 for existing emails while
  forgot-password is enumeration-safe. Make register always answer "check your email" and send an
  "account already exists" email instead of erroring. _Test:_ existing vs new email → identical
  response shape.
- **S6 headers/CSRF:** add `helmet`; add an origin-check (or double-submit token) middleware;
  reconsider `sameSite` (`lax` outside production). _Test:_ helmet headers present; cross-origin
  state-changing request without origin rejected.
- **S10 projection leak:** `getUsers`/`getUserById` `SELECT *` minus only `password_hash`, so admin
  listings return `mfa_secret` ciphertext + `google_id`. Switch to explicit column projection.
  _Test:_ admin user response contains no `mfa_secret`/`password_hash`.
- **S11 bcrypt cost:** 10 → 12, env-configurable (`BCRYPT_COST`, validated). _Test:_ config parse.

**Status (2026-07-31) — DONE, with three scope decisions.**

- **S5:** register and request-email-change now answer identically whether the address is taken or
  not; the address owner gets a new `accountExists` email (template + `sendAccountExists` on the
  email service) instead of the requester getting a 409. The email-change taken path also still
  sends the change-notification to the current address, so the requester's own inbox is no oracle
  either. _Decision:_ the **admin-invite 409 stays** — it is an authenticated, admin-only surface
  and admins can already list every user; enumeration protection there would only cost usability.
  The confirm-time `409 Email is no longer available` also stays: completion against a unique
  constraint cannot be made silent.
- **S6:** `helmet()` with defaults, and a new `middleware/originCheck.ts` — a state-changing
  request carrying an `Origin` other than `ALLOWED_ORIGIN` is rejected 403; requests without an
  Origin pass (non-browser clients aren't CSRF vectors). _Decision:_ origin-check over
  double-submit tokens — no client change, no token plumbing, and sameSite already provides the
  primary defence. `sameSite` needed no change: it is already `strict` in production and `lax`
  outside, exactly what the item asked to reconsider towards.
- **S10:** widened beyond the two named functions — every general-purpose read **and write**
  in `users.models.ts` and `admins.models.ts` now selects/returns an explicit `SAFE_*_COLUMNS`
  projection (the `RETURNING *` sites had the same leak: an admin update response included
  `mfa_secret`). Secrets now leave those tables only via the explicitly-named
  `*WithPassword`/`*WithMfaStatus` lookups, and `excludePasswordHash` is deleted — the projection
  made it dead code. _Decision:_ `google_id` **stays** in the projection; the profile response
  derives its "Google linked" boolean from it, and it is an opaque reference, not credential
  material.
- **S11:** `BCRYPT_COST` (default 12) via `getBcryptCost()` in config, validated at boot with the
  other numeric knobs; `jest.env.ts` pins cost 4 so suites don't pay production-grade hashing on
  throwaway passwords.

Tests: register enumeration (new vs existing → identical shape), email-change taken-address 200,
a new `securityHeaders` spec (helmet headers, cross-origin 403, allowed/absent origin pass, reads
exempt), `mfa_secret` absence asserted on admin listings, and `BCRYPT_COST` rows in the
validateEnv table.

---

## Phase B — Test hardening (the safety net before any refactor)

Rationale: 26 of 73 endpoints have zero test traffic and the role boundary is untested repo-wide.
Extracting services under that suite would be refactoring blind. This phase writes
**characterization tests against current (post-Phase-A) behaviour** so the service extraction in
Phase C can prove it changed nothing. All are generic and valuable regardless of the refactor.

- **B1 · Wrong-role boundary matrix.** For every route group, assert a user cookie is rejected by
  `authoriseUser(["admin"])` (403) and an admin cookie is rejected on user-only routes. This is the
  single highest-value gap — today a regression swapping `["admin"]`→`["user"]` ships green.
- **B2 · Missing admin route groups.** Full specs for `admin/organizations.routes.ts` (10 endpoints,
  incl. delete) and `admin/mfa.routes.ts` (7 endpoints) — the two route groups with no spec at all.
  Each to the house minimum (happy / 401 / 403 wrong-role / cross-org where applicable / 400).
- **B3 · Cross-org isolation.** Add cross-org 404/403 tests for the eight `:organizationId`
  member/detail endpoints, and a model-layer "org A never sees org B rows" test (a stated per-model
  minimum currently asserted nowhere).
- **B4 · Self-account mutations.** `PUT /auth/change-password` and `PUT /auth/profile` — zero
  coverage today.
- **B5 · Crypto/token unit tests.** Pure-logic units for `mfaChallenge`, `totp`, `encryption`
  (round-trip), `backupCodes`, `determinateHash`, `sanitizeUrl`, `parseCookies`, `pgErrors`
  (assert the typed helpers, which nothing currently uses). These are trivially testable and
  guard the exact code the security fixes touch.
- **B6 · Web boundary tests.** `AdminRoute` (untested while `ProtectedRoute` has 4), one MFA-flow
  test, one invitation-accept test, and at least one form-error and one async-error path (no MSW
  500→ErrorMessage assertion exists anywhere). Add the MSW handlers these need.

**Status (2026-08-01) — DONE.** Full gate green: 856 API tests (37 suites), 50 web tests
(9 files), format/typecheck/lint clean.

- **B1** — `integration/roleBoundary.test.ts` (111 tests): every route classified
  public/user/admin in one table; wrong-role cookie → 403, no cookie → 401 for all protected
  routes. A completeness sweep walks the real Express router and diffs the multiset of
  router-local paths against the table, so an unclassified new route fails the suite. (Express 5
  layers don't retain mount prefixes, hence tails rather than full paths.)
- **B2** — `integration/adminOrganizations.test.ts` (22 tests, all 10 endpoints) and
  `integration/adminMfa.test.ts` (25 tests: all 7 management endpoints plus an "Admin MFA Login
  Flow" describe mirroring `userMfa.test.ts` — TOTP/backup login, replay and attempt-cap S9
  assertions — so C2's twin-collapse can prove admin login behaviour is preserved; pins the
  `qrCode`-vs-`qr_code` casing straggler for D6).
- **B3** — `integration/crossOrgIsolation.test.ts` (13 tests): a non-member 403s on all 12
  org-scoped endpoints, plus a direct-DB assertion that the target org is untouched; model-layer
  "org A never sees org B rows" test added to `CRUD/organizationMembersCRUD.test.ts`.
- **B4** — `integration/selfAccount.test.ts` (9 tests): change-password happy path, wrong
  current password, validation, refresh-token revocation (the pre-change refresh token can no
  longer mint a session), and the passwordless-account 400. `PUT /auth/profile` is pinned as the
  read-only no-op it currently is — the D3 decision (implement or remove) must update that spec.
- **B5** — eight new unit suites (`mfaChallenge`, `totp`, `encryption`, `backupCodes`,
  `determinateHash`, `sanitizeUrl`, `parseCookies`, `pgErrors`): GCM round-trip + tamper
  rejection, TOTP verify against library-minted codes, challenge-JWT type/expiry/signature
  rejections, SHA-256 vector, XSS-scheme neutralisation, cookie parsing edge cases, and the
  typed pg-error helpers.
- **B6** — `AdminRoute.test.tsx` (mirrors ProtectedRoute, bounces to `/admin/login`),
  `MfaVerifyForm.test.tsx` (TOTP submit, backup-code switch, shared-schema form errors),
  `AcceptInvitePage.test.tsx` (new-user vs existing-user password field, invalid-invitation
  state, form error, successful accept + navigation), `OrganizationDetailPage.test.tsx` (MSW
  500/403 → error component). Invitation MSW handlers added to `test/handlers.ts`, validated
  with `acceptInviteSchema`.
- **Not bundled:** A5/S8 (password on MFA disable) remains the one open Phase A item — it
  changes the shared `mfaDisableSchema` contract and both disable handlers, so it was kept out
  of a characterisation phase. The B2/roleBoundary disable specs will need updating when it
  lands.
- **Post-review fixes (same date, pre-commit):** a self-review pass against the layering/reuse
  rules produced: the admin MFA login-flow spec above (the one real coverage gap — the S9
  machinery ran at four call sites with only the user two tested); `backupCodes` now uses
  `getBcryptCost()` instead of a hardcoded 10; `getAllowedOrigin()` extracted to `utils/config`
  and consumed by `originCheck` + the CORS options (the default had been inlined three times);
  the user backup-verify handler now guards on the pool before its transaction, matching the
  admin twin (the CAS consume remains the enforcement — the guard is a fail-fast pre-check, and
  the twins must stay identical for C2).

---

## Phase C — Extract the services layer

Only after Phase B is green. Answer to "is there still heavy logic in controllers?": **yes** —
~27 of 73 handlers carry multi-step orchestration, 21 of 22 transactions live in controllers.
Extract in this order (each is behaviour-preserving under the Phase B suite):

- **C1 · `authService`** — owns token minting and session issuance. Today `jwt.sign` + raw env-key
  reads are duplicated at 12 sites across 5 controllers, each with its own `if (!key) throw 500`.
  A single `issueSession(principal)` that always runs the MFA / `is_active` branch makes the S2/S4
  class of bug **structurally impossible** rather than remembered per-call-site. This is why the
  refactor is security-relevant, not just tidiness. Fold the Phase-A session paths through it.

  **Status (2026-08-05) — DONE.** `services/auth.service.ts`:
  `createAuthService({ getAccessKey, addRefresh, createMfaChallengeToken })` exposes
  `issueSession(principal, client?)` (15-minute access token + rotating refresh pair; refuses a
  deactivated principal) and `startSession` (adds the MFA branch: challenge instead of session).
  All eleven controller `jwt.sign` sites — login/MFA-verify/backup-verify ×2 roles, OAuth
  callback/link, invitation accept, complete-registration — now route through it; controllers
  keep credential checks and response shaping. `getAccessKey` joined `utils/config`. Full gate
  green with the inherited suites untouched; new unit suite `unit/authService.test.ts` drives the
  branching with injected fakes.
  - **Deliberately hardened where no test pinned the old behaviour:** OAuth login/link and every
    MFA verify path previously minted sessions without an `is_active` check (and admin MFA verify
    minted for a _deleted_ admin, `root` defaulted false). All now refuse: 403 deactivated, 404
    missing principal, before any token exists. Each hardened path ships with its integration
    spec: deactivated Google login → 403 + no refresh row; deactivated Google link → 403 + link
    rolled back; deactivated mid-challenge TOTP verify → 403; deleted admin backup-code verify →
    404 (the backup route is the live wiring for the ghost check — TOTP 400s at the secret
    lookup, which filters `deleted_at`).
  - **One pinned nuance honoured:** `userOAuth.test.ts` pins that a deactivated MFA account still
    receives a challenge, so `startSession` branches on MFA _before_ deactivation; the gate lives
    in `issueSession`, which every verify path routes through — the challenge can start, a
    session can never come of it.
  - **Not folded in:** the refresh-rotation path (`refresh.models.ts#createAccessToken`) — its
    export is pinned by `refreshCRUD.test.ts`, and the A1 deferrals (lineage walk, dedicated
    refresh endpoint) remain open. The MFA controller twins are now symmetrical (principal
    fetched before issuance on both sides), ready for C2's collapse.

- **C2 · `mfaService({ roleType })`** — collapses the ~280-line near-identical user/admin MFA
  controller twins into one parameterised service.

  **Status (2026-08-05) — DONE.** `services/mfa.service.ts`:
  `createMfaService({ roleType, principals, store, challenges, runTransaction, issueSession,
email })` — one generic factory, instantiated twice in the composition root
  (`services.userMfa` / `services.adminMfa`). The role-specific principal lookups and the
  session-claim mapping arrive as deps, so the roles differ by wiring, not code. Covers the seven
  management flows (setup, verify-setup, verify, disable, backup verify, regenerate, status)
  **and** the login-challenge completion pair that lived in the auth controllers
  (`completeLoginWithTotp` / `completeLoginWithBackupCode`) — the four A7/S9 verify sites now run
  one implementation. Both `mfa.controller.ts` twins are pure response shaping, with the
  `qr_code`/`qrCode` casing divergence now visibly their only difference (commented for D6); the
  four `mfaLogin*` handlers are cookie-in/cookie-out shims. One mechanism note: the completion
  methods take an `onChallengeConsumed` callback fired the moment the challenge is spent, so the
  controller drops the challenge cookie at exactly the pre-extraction point — including on the
  deactivated-403 path, where the cookie clears but no session is minted — rather than only on
  success. Behaviour-preserving under the Phase B net (900 API + 50 web tests green, no spec
  edits); new `unit/mfaService.test.ts` (27 tests) drives every flow with in-memory
  store/challenge/principal fakes.

- **C3 · `invitationService`** — extract `acceptInvitation` (the largest un-extracted orchestration:
  validate, branch, bcrypt, create user, add member, mark used, issue session). Also removes the raw
  SQL currently sitting in `auth.controller.ts:755` by routing it through the model.

  **Status (2026-08-05) — DONE.** `services/invitation.service.ts`:
  `createInvitationService({ invitations, users, organizations, members, startSession,
sendOrgInvite, runTransaction })` owns both org-invitation flows. `acceptInvitation` moved
  verbatim — same transaction boundary, same error messages and ordering, S2's
  membership-≠-authentication decision and its comments intact — which also relocates the fork's
  seat-policy hook site into the service. `inviteMember` moved with it (it is invitation-domain
  and one of the four untransactioned flows): its invalidate-pending + create-invitation pair now
  runs inside one transaction, closing the partial-failure window where an address's previous
  invitations were already invalidated but the new one failed to insert; the reads stay
  pool-side and the email still sends after commit, as before. The raw
  `UPDATE users SET email` in `confirmEmailChange` now routes through `modifyUser` — two
  deliberate hardenings where nothing pinned the old behaviour: a vanished/deleted user is now a
  404 instead of a silent success, and a unique-violation race is a 409 instead of a 500 (the
  pre-check's `Email is no longer available` 409 is unchanged). `listInvitations` /
  `cancelInvitation` / `getInvitation` stay in the controller — single model call plus shaping,
  thin already. Full gate green (914 API + 50 web, no spec edits); new
  `unit/invitationService.test.ts` (14 tests) drives both flows with in-memory fakes, including
  the S2 challenge-with-committed-org-join outcome and the invalidate+create atomicity.

- **C4 · OAuth adapter seam** — `utils/googleOAuth.ts` reads env internally and is imported straight
  into controllers, so `googleCallback` can't be unit-tested without network stubs (the exact defect
  email had pre-uplift). Wrap it as an injected adapter with a deterministic fake, mirroring the
  email adapter — this is the pattern billing's payment providers will follow, so getting it right
  here is doubly worth it.

  **Status (2026-08-05) — DONE.** `interfaces/googleOAuth.ts` defines `GoogleOAuthProvider`
  (isConfigured / generateState / getAuthUrl / exchangeCodeForTokens / getUserInfo) and owns the
  wire types; `utils/googleOAuth.ts` keeps its five functions as the real implementation, and the
  composition root builds the adapter over them with late-bound wrappers — the exact
  `emailProvider` construction — so the OAuth integration suite's `jest.mock` of the module path
  still intercepts and runs **unmodified**. The orchestration moved to
  `services/oauth.service.ts`: `createOauthService({ google, users, getMfaStatus, startSession,
issueSession, runTransaction })` with `beginGoogleAuth` / `completeGoogleCallback` (the
  four-outcome transaction, verbatim) / `linkGoogle` / `unlinkGoogle`. `linkGoogle` takes an
  `onPasswordVerified` callback (the C2 cookie-timing pattern) so the pending-link cookie is
  still consumed after the password check but before the transaction — a failure part-way still
  clears it. `oauth.controller.ts` keeps only query/state validation, cookie handling and
  response shaping; `config.controller.ts`'s `isGoogleOAuthConfigured` read stays as-is (a config
  probe, not orchestration). New `unit/oauthService.test.ts` (16 tests) drives all four flows
  with a fake provider and in-memory models — no `jest.mock`, no network: the C4 defect,
  demonstrated fixed. Full gate green: 930 API tests (41 suites), 50 web.

- Wrap the four currently-untransactioned multi-step flows (`register`, `forgotPassword`,
  `requestEmailChange`, `inviteMember`) in `withTransaction` as they move into services.
  _(`inviteMember` done with C3; the other three remain, pending their own extractions.)_

---

## Phase D — Contract, correctness, and the unfinished 0.6 deliverables

- **D1 · Schema single-source (your stated priority).** Move the ~14 duplicated pure-DTO schemas out
  of `api/src/types` so they live once in `shared`; the API derives restrictions via `.pick()`/
  `.omit()` and the web derives additions via `.extend().refine()` (e.g. the confirm-password forms).
  Move the two admin request schemas (`adminInviteUserSchema`, `updateUserSchema`) into shared so the
  web stops hand-rolling copies. Collapse the two `PaginationOptions`. Delete the dead-and-wrong
  `mfaRequiredResponseSchema`. Row shapes carrying `password_hash`/`mfa_secret` stay API-internal —
  that split is correct. **Rule to prevent recurrence:** the API never defines a schema for anything
  the frontend also sees.

  **Status (2026-08-06) — DONE.** `api/src/types` now carries only genuinely internal shapes
  (rows with secrets, model insert/patch DTOs, JWT/request plumbing); every schema the frontend
  also sees lives once in `shared`. Fourteen duplicated schemas deleted from the API copies
  (login ×2 roles, register, complete-registration, forgot/reset-password, change-password,
  update-profile, request-email-change, invite-member, accept-invite, the invitation row,
  user/admin stats), with routes, models, seed, services and one unit spec importing from
  `@auth-boilerplate/shared` instead; the internal user patch DTO is renamed
  `userPatchSchema`/`UserPatchDto` so it can no longer be mistaken for the HTTP contract. The
  two admin request schemas moved into shared: `adminInviteUserSchema` verbatim, and
  `updateUserSchema` rebuilt as the real contract —
  `{email, password, email_verified, is_active, can_create_orgs}`, all optional. One deliberate
  hardening rode along: the old schema was derived from the row shape, so row-management
  columns passed validation, and `deleted_at`/`deactivated_at`/`deactivated_by` sit in the
  model's patch allow-list — an admin PUT could soft-delete a user while skipping the delete
  flow's token revocation (an S4 bypass). The narrowed contract strips them, pinned by two new
  integration tests (row-management-only body → 400 with the row untouched; mixed body → legal
  fields applied, row-management fields ignored). `password` stays in the contract
  deliberately: it preserves today's 403-at-the-model behaviour, whose fate is the D3
  set-user-password decision. The web's two hand-rolled admin schemas are gone —
  AdminUsersPage validates with shared `adminInviteUserSchema`, AdminUserDetailPage derives
  its form via `updateUserSchema.pick({email, is_active}).required()`, and the admin mutations
  are typed by the shared DTOs. Also under this item: the two `PaginationOptions` collapsed
  (the shared copy had no consumers; the API-internal one — a model-layer concern, not a
  contract — survives), the dead `mfaRequiredResponseSchema` deleted, and the D6
  invitation-shape straggler fixed below. Gate: 945 API tests (41 suites), 55 web.

  **Reviewed (2026-08-06) — clean, no findings.** A security pass and an adversarial
  correctness pass over the working tree both cleared the change: every touched contract is
  equal or strictly narrower field-by-field (the only widening is at the _type_ level — shared
  `UpdateUserDto` advertises `password`, which the model still 403s; deliberate, D3 decides);
  nothing newly exported from shared carries secret material; every route that validated with a
  deleted schema still wires `validateBody` with the shared equivalent; the flat invitation
  response drops `organization.slug`, which had no consumer anywhere. Message drift was ruled
  out by executing the installed zod (4.x): bare `.email()`'s default message is already
  "Invalid email address", so the deleted bare-`.email()` login schemas and their
  message-carrying shared replacements produce identical issues, and the web form derivations
  (`.pick().required()`) were verified to yield the old hand-rolled messages exactly. The
  `modifyUser` allow-list's row-management residue is currently dead capability (both call
  sites verified: the admin controller's stripped body, and `confirmEmailChange`'s literal
  `{email}`) — trimming it to match the contract is recorded under D6. Observations recorded,
  not fixed here: shared `invitationSchema` models the full row including `token_hash`
  (pre-existing, type-level only — D6); `modifyUser` doesn't lowercase email while `createUser`
  and every lookup do (pre-existing — D6); admin-PUT-password's 403 path has no test (attach it
  to the D3 set-user-password decision).

- **D2 · Organizations soft-delete (billing prerequisite).** Add `deleted_at` to `organizations`,
  filter it everywhere, convert `deleteOrganization` from hard cascade to soft delete. Billing will
  FK financial history to organizations, so a hard cascade would either be blocked by the FK (500) or
  destroy money history. Do this before billing schema lands. Aligns with the fork's stated
  "organizations are never hard-deleted" invariant.

  **Status (2026-08-05) — DONE.** Migration `004_organizations_soft_delete.sql` adds nullable
  `deleted_at` and swaps the slug UNIQUE constraint for a partial unique index
  (`WHERE deleted_at IS NULL`, same name) — a deleted organization no longer reserves its slug
  forever, while live duplicates still 409. `deleteOrganization` is now
  `UPDATE … SET deleted_at = NOW()` (second delete → 404, not a no-op); every read in
  `organization.models.ts` filters `deleted_at IS NULL` (by-id, by-slug, both listings, stats,
  member-count, and `modifyOrganization`'s WHERE). All org SQL lives in that one model file, and
  the org-scoped middleware already resolves the organization through `getOrganizationById` —
  so every org-scoped route 404s after deletion with **zero middleware or controller changes**,
  even though membership rows deliberately persist (an integration test pins exactly that:
  membership intact in the DB, route 404 for the ex-owner). Shared `organizationSchema` gains an
  optional `deleted_at` (always null in responses — reads filter it). Two design notes: member
  rows are kept, not cascaded — the fork's seat ledger and any audit trail keep their history,
  and the middleware gate makes them inert; the admin delete endpoint shares the same model
  function, so both paths soft-delete. Tests: five new CRUD cases (row+membership persistence,
  every-lookup-respects-deleted_at, slug reuse + live-duplicate 409, stats exclusion, double
  delete 404) and two integration cases (ex-member lockout across org-scoped routes + absence
  from listings; slug freed through the API). The org-suite pre-existing specs run unmodified —
  the old delete specs asserted through the model layer, which behaves identically from the
  outside. Full gate: 943 API tests (41 suites), 55 web. **With A2 long done, billing in the
  fork is now unblocked.**

  **Reviewed (2026-08-05) — one real find, fixed.** The security pass verified the middleware
  seal across all 24 org-scoped routes and the whole admin surface, and confirmed the partial
  index swap (constraint name proven empirically; 23505 fires for index violations, so the 409
  survives). The find: `ON DELETE CASCADE` used to destroy an org's **pending invitations**;
  with soft delete they outlived it, and the public accept endpoint would mint a verified
  account plus a membership row inside the dead tenant (inert behind the middleware today, a
  privilege bug the day an undelete lands). Fixed: `acceptInvitation` resolves the organization
  in-transaction and `getInvitation` checks it too — a dead-org token now answers 404
  `Invalid or expired invitation` at both endpoints, indistinguishable from a token that never
  existed. Three tests pin it (unit: refusal writes nothing; integration: both endpoints 404
  with DB-level assertions that no user/membership was created). Deliberately left:
  `transferOwnership`'s org UPDATE is unfiltered but unreachable (behind `requireOrgOwner`,
  which 404s), and adding the filter would create a silent no-op since that statement's row
  count goes unchecked; the deps-injected `getOrganizationById` reads via the pool inside the
  accept transaction, consistent with that flow's other reads.

- **D3 · Finish or cut the broken features** the audit found — decide per feature, don't ship
  half-wired: wire `/admin/users/stats` (model exists, unrouted → dashboard tiles stuck at 0);
  fix or remove admin set-user-password (always 403s today) and the no-op `PUT /auth/profile`; fix
  the OAuth UI end-to-end (button posts to a JSON route, no SPA callback route, Unlink is a GET to a
  POST route) or gate OAuth off by default until it has a working UI; decide the admin-management
  slice (listing/create/disable + last-admin protection) since "B2B multi-tenant" implies it and the
  `admins` model is 391 lines of which two functions are routed.

  **Decided (2026-08-06) — all five settled; implementation next.**

  1. **`/admin/users/stats`: wire it.** Not a decision — the web already ships
     `useAdminUserStats` calling exactly that path and the dashboard tiles read 0 only because
     the route is missing; `getUserStats` exists and is CRUD-tested. Route + integration tests
     to the house minimum.
  2. **Admin set-user-password: removed.** Drop `password` from the shared `updateUserSchema`
     and the controller's hash-and-pass path (which today only ever reaches the model's 403).
     Admins keep the existing, working send-password-reset email flow — password custody stays
     with the user. This also settles the D1-review note about the untested 403 path: the field
     leaves the contract instead (a password-bearing body then strips to its other fields, or
     400s "No valid fields to update" if password was all it carried — pin that). The model's
     `password_hash` guard stays as the backstop.
  3. **`PUT /auth/profile`: removed.** Profile's only field is email and email changes go
     through the verified request-email-change flow; there is nothing for it to update. Delete
     route, controller, shared `updateProfileSchema`, and rewrite the B4 spec that currently
     pins the no-op into one asserting the route is gone (404). Check the web for any caller
     first.
  4. **OAuth UI: fix end-to-end.** The backend is solid, tested, and behind the C4 adapter —
     this is the last mile. Button becomes a real redirect to the auth URL, add the SPA
     callback route, Unlink becomes a POST. FE tests per the B6 pattern (MSW at the HTTP
     boundary).
  5. **Admin-management slice: build it.** B2B multi-tenant implies multiple platform admins
     and the model layer (incl. root-admin protections) already exists and is CRUD-tested.
     Routes + controllers for list/create(invite)/disable + last-admin protection, integration
     tests to the house minimum, wrong-role rows added to the `roleBoundary` table, and a
     minimal admin UI page. Follow the existing admin-users area pattern; root-only where the
     action affects another admin.

  Sequencing within D3: 1–3 are small and land first (2 and 3 shrink surface before 4 and 5
  grow it); 4 and 5 are independent slices in either order.

  **Status (2026-08-06) — DONE, all five landed.**

  1. **Stats wired.** `GET /api/admin/users/stats` routed (registered before the `/:userId`
     param routes so "stats" is never captured as a userId), handler mirrors the org-stats
     shape; the dashboard tiles work with zero FE change. Tests: a live-DB cross-check of all
     six counts, 401, roleBoundary row.
  2. **Set-user-password removed.** `password` left the shared `updateUserSchema` (with the
     schema comment updated to say why); the controller's hash-and-pass path and its
     `hashPassword` import are gone; the model's `password_hash` 403 guard stays as the
     backstop. Pinned exactly as planned: a password-only body → 400 "No valid fields to
     update" with the old password still working, and a mixed body applies the legal fields
     while the smuggled password never lands (asserted by a failed login with it).
  3. **`PUT /auth/profile` removed.** Route, `updateProfile` controller, shared
     `updateProfileSchema`, and the web's `useUpdateProfile` (which had zero call sites)
     all deleted; the B4 spec block now pins the 404, and the roleBoundary row is gone. The
     web's ProfileTab was already on the request-email-change flow and needed nothing.
  4. **OAuth UI fixed end-to-end, backend untouched.** The design keeps the tested JSON
     contract: `GOOGLE_CALLBACK_URL` now points at the SPA's new `/oauth/callback` route
     (setup.ts template + README updated), whose page performs the one-shot code exchange
     against the API and routes by outcome — session → refetch `["me"]` → dashboard;
     `mfa_required` → the challenge page via a new `AuthContext.startMfaChallenge()` (the
     flag MfaVerifyPage gates on was previously settable only by `login()`);
     `needs_linking` → an inline password form driving `POST /oauth/google/link`, which was
     previously uncalled from the web. The Login/Link buttons now fetch the auth URL from a
     new `api/queries/oauth.ts` and `window.location.assign` it (they were anchors
     navigating to the JSON endpoint), and Unlink is a real POST mutation invalidating
     `["me"]`. Web tests per B6: five OAuthCallbackPage cases (all outcomes + no-code +
     API rejection) and the OAuthTab gating trio, with MSW handlers (`googleCallbackIs`
     override factory) validating the link payload against the shared schema.
  5. **Admin-management slice built.** Migration `005_admin_registration_invitation_type.sql`
     adds an `admin_registration` invitation type ("become a platform admin" — distinct from
     `admin_invite`, which creates a _user_), mirrored in shared `INVITATION_TYPES` and the
     TTL map (7 days). New `/api/admin/admins` area: list (any admin, `adminsQuerySchema`
     filters incl. `root`), invite (root-only; email template links to
     `/admin/complete-registration`), and `POST /:adminId/disable` (root-only; revokes the
     target's tokens in-transaction, S4). Redemption is the public
     `POST /api/admin/auth/complete-registration`, mirroring the user flow: creates a
     non-root admin, marks the invitation used, issues a session via authService. Root
     gating is a new `requireRootAdmin` middleware that **re-reads the admins row rather
     than trusting the token's `root` claim** — refresh rotation currently mints tokens
     without it (the D6 claims-drift item), so a claims check would silently drop root
     after the first refresh. Last-admin protection is the model's existing
     only-active-root-admin 409; since root is the only caller of disable, a root
     self-lockout is structurally impossible (asserted over HTTP). New
     `integration/adminAdmins.test.ts` (20 tests: house minimum per endpoint plus root-gating
     403s, re-invite invalidation, invitation-type confusion 400, S4 refresh revocation);
     four roleBoundary rows. Minimal UI: AdminAdminsPage (list + root-gated invite dialog
     and disable confirm), AdminCompleteRegistrationPage, dashboard card, hooks keyed
     `["admin","admins"]`; a gating test pins that a non-root admin is offered neither
     mutating action.

  Gate: 976 API tests (42 suites), 66 web tests (13 files), format/typecheck/lint clean.

  **Reviewed (2026-08-06) — clean at HIGH/MED; three fixes applied from the pass.** A security
  pass and an adversarial correctness pass over the working tree found no privilege escalation
  (root gating holds unauthenticated/user/non-root; invitation type-pinning refuted in both
  directions — an admin_registration token cannot mint a user and no other type can mint an
  admin; the removed set-password path is dead at all three layers) and no runtime
  regressions. The one deep FE candidate — AdminCompleteRegistrationPage bouncing to
  /admin/login because the me-query had already 401'd — was refuted empirically against the
  installed React Query v5: invalidateQueries reverts an errored query to pending, so
  AdminRoute spinners through the refetch, and the pattern is identical to the existing
  admin login. Fixed from the findings: (1) the admin-invite duplicate pre-check now
  lowercases before lookup — the admins model matches email verbatim while createInvitation
  stores lowercase, so a mixed-case duplicate slipped the 409 and failed only at redemption,
  after the invitee had set a password; pinned by a mixed-case 409 test. (2) The invite's
  invalidate+create pair now runs in one transaction (the C3 inviteMember shape), closing
  the concurrent-double-invite window that left two live tokens. (3) requireRootAdmin also
  refuses an inactive root — unreachable via the API today under the single-root invariant,
  pure defence in depth. Known and accepted: a disabled admin's access token stays valid up
  to its 15-minute expiry (the S4 trade-off, same as users). Recorded under D6, not fixed
  here: the admins model's email-casing gap generally (login included, pre-existing),
  disable's non-CAS already-deactivated check, and OAuthTab's Link lacking link-intent
  through the OAuth round trip.

- **D4 · Enforce the layering that's currently discipline-only.** Add `no-restricted-imports`/
  boundaries lint for the FE three-tier rule and a rule catching raw `client.query` in controllers —
  both currently hold by convention and the next violation ships silently.
- **D5 · Conventions doc + CI runner (unfinished 0.6).** Write the conventions doc upstream (today it
  exists only as the fork's `CLAUDE.md`, which admits it's a hand-synced copy — the exact drift the
  upstream doc is meant to prevent). Add a GitHub Actions workflow running the five-command gate on
  push (there is no CI runner today; "gate" currently means npm scripts nobody runs automatically).
  Regenerate `README.md` and `api-reference.md` from the actual API — both describe a
  `{success, msg}` envelope the code has never emitted and several nonexistent endpoints.
- **D6 · Small correctness stragglers.** `transfer-ownership` and `org-permission` routes lack
  `validateBody` (500 / unvalidated body); `refresh.models.ts:64-72` hand-rolls a patch with no
  column allow-list (route through `buildPatch`); `MFA_ENCRYPTION_KEY` format-check at boot; MFA
  setup response casing differs between user (`qr_code`) and admin (`qrCode`).
  - **From the D1 review (2026-08-06):** trim `USER_PATCH_FIELDS` of
    `deleted_at`/`deactivated_at`/`deactivated_by` — no remaining caller can set them, and the
    model should be the backstop for the narrowed HTTP contract, not a wider allow-list;
    `modifyUser` doesn't lowercase `email` while `createUser` and every lookup do, so an admin
    PUT with a mixed-case address makes the account unloginable; shared `invitationSchema`
    models the full invitation row including `token_hash` (type-level only — no endpoint
    serialises it) which sits against D1's row-shapes-stay-internal rule — split a public row
    shape from the API-internal one when next touched.
  - **From the D3 review (2026-08-06):** the admins model never normalises email case —
    every lookup (`getAdmin`, `getAdminWithMfaStatus`, so admin **login** too) binds the raw
    string and `createAdmin` inserts verbatim, unlike the users model which lowercases at
    both ends; a mixed-case habit 401s against a lowercased row. Normalise across
    `admins.models.ts` when next touched (the D3 invite controller lowercases at its edge as
    a local shim). Also: `deactivateAdmin` is unconditional on `is_active` (no CAS and no row
    lock), so two concurrent disables both 200 and the second overwrites
    `deactivated_at`/`deactivated_by` — make it a compare-and-set (`… AND is_active = true
RETURNING`, rule 1's pre-check shape). And OAuthTab's "Link" reuses the login flow with
    no link-intent carried through the OAuth round trip: a signed-in user whose Google email
    differs from their account email gets a _new or different_ session instead of a link —
    needs a link-specific state param before the mismatch case can be handled honestly.
  - **`trust proxy` is never set** (A1-part-1 review, 2026-08-05): behind any reverse proxy,
    express-rate-limit keys every client to the proxy's IP (the limiter's
    `xForwardedForHeader: false` validation silence hides the warning). The intended production
    topology is a Hetzner box behind Cloudflare, so the posture is: `trust proxy` = the hop
    count (1 if Cloudflare talks straight to Node, 2 with a local nginx/Caddy in between),
    **and** the origin firewalled to Cloudflare's IP ranges — without that, anyone hitting the
    origin directly can forge `X-Forwarded-For` and dodge every per-IP limit. Make it an env
    knob (`TRUST_PROXY_HOPS`, validated at boot) rather than a hardcode.
  - **Refreshed access tokens drop claims** (same review): `createAccessToken` mints
    `{role_id, role_type}` tokens while `issueSession` mints tokens carrying
    `root`/`email_verified`. Nothing reads those claims server-side today; fold the rotation
    mint into authService before anything does. _(The lifetime half of this drift — 10m at
    rotation vs 15m at issue — was closed 2026-08-06: both sites now share
    `ACCESS_TOKEN_LIFETIME_SECONDS`; the claims half remains.)_ Relatedly, the refresh JWT's own
    `refresh_id`/`role_id`/`role_type` claims are vestigial — identity comes from the hashed
    row since the A1 hardening, and only the signature and `exp` are consumed — so the fold-in
    should either strip them or keep them as a deliberate debugging affordance, not by inertia.
  - **Session-revocation posture (D3 follow-up, 2026-08-06; knob DONE, switch recorded).**
    Access tokens are stateless by design, so disable/logout bind at the next refresh, not
    instantly — the accepted trade-off (A4), bounded by the access-token lifetime. That bound
    is now an explicit env knob: `ACCESS_TOKEN_LIFETIME_SECONDS` (default 900, validated at
    boot with the other numeric knobs), shared by both mint sites and the access cookie's
    maxAge, so a cautious deployment shrinks the window by config alone. If a deployment ever
    needs _instant_ revocation, the designed answer is an `AUTH_REVALIDATE_PRINCIPAL=true`
    env switch making `authoriseUser` re-load the principal per request — exactly what
    `requireRootAdmin` already does, promoted to a global option: one branch over one code
    path, per-request DB cost paid knowingly. A dual session architecture (stateful sessions
    alongside JWTs, selected by env) was considered and rejected — it forks the entire
    session machinery and doubles the auth test matrix for a property the switch delivers
    alone. Build the switch only when a real consumer asks.
  - **`validateEnv` doesn't assert key distinctness** (REFRESH_KEY vs the access keys) — equal
    keys would let a refresh token verify in the access slot. `setup.ts` generates them
    randomly; a boot-time distinctness check is cheap defence in depth.
  - **`GET /invitations/:token` returns a nested `organization` object while the shared
    `publicInvitationSchema` and `AcceptInvitePage` expect flat
    `organization_id`/`organization_name`** (surfaced by the D2 review; pre-existing) — the FE
    falls back to "an organization" instead of showing the name. Align the shape under D1's
    schema single-sourcing. _Fixed with D1 (2026-08-06):_ the response is now the flat
    `publicInvitationSchema` shape (including the previously missing `type`), the
    AcceptInvitePage name and post-accept navigation work, and a test asserts the response
    parses against the shared schema verbatim.
  - **Invitation redemption has no designed concurrency guard** (surfaced by the C3 review,
    2026-08-05; pre-existing, moved verbatim into `invitation.service.ts`). Two concurrent
    accepts of the same token both read the invitation unlocked (`validateInvitationToken` has
    no `FOR UPDATE`) and `markInvitationUsed` has no `used_at IS NULL` predicate, so neither
    detects the other. Today exactly one wins — but only because the loser's transaction dies on
    the `organization_members` (or `users.email`) unique constraint, i.e. the constraint is the
    mechanism, not the backstop, and the loser's 409 talks about membership rather than the
    invitation. The incidental guard evaporates the day someone makes `addOrganizationMember`
    duplicate-tolerant — and in the fork this transaction carries the seat-policy hook, so a
    double-commit would double-fire billing. Fix: `validateInvitationToken` takes the invitation
    row `FOR UPDATE` (rule 6), and `markInvitationUsed` becomes a compare-and-set
    (`… AND used_at IS NULL RETURNING id`, throw on no row — rule 1's pre-check shape, matching
    the MFA-challenge consume). Ship with a two-concurrent-accepts integration test asserting
    one session, one membership row, and an invitation-shaped error for the loser.

    **Status (2026-08-07) — DONE; half the premise turned out stale.** `getInvitationByTokenHash`
    has carried `FOR UPDATE` since the original invitation commit, and every redemption flow
    (org-accept, both complete-registrations, password reset, email change) validates inside its
    transaction with the client passed — so concurrent redeems already serialised on the row
    lock, and the loser already answered 400 "Invitation has already been used" out of
    `validateInvitationToken`. What was real: `markInvitationUsed` had no `used_at IS NULL`
    predicate, leaving the downstream unique constraints as the only guard if the lock
    discipline ever slips (exactly the fragility described above). It is now a compare-and-set;
    on a missed update it re-reads to answer honestly (404 row missing / 400 already used).
    Comments at both sites document the lock discipline. Tests: the two-concurrent-accepts
    integration test as specified, plus a CRUD pin of the CAS refusal.
- **D7 · Supply chain.** Adopted 2026-08-05, the day after the 4 Aug npm worm (2,234 poisoned
  versions across 444 packages, including `flat-cache`/`file-entry-cache` — inside ESLint, and
  therefore inside this tree). Two facts drive the design: install scripts were the execution
  vector, but a poisoned package that ships _runtime_ code executes whenever it is `require`d —
  so script-blocking alone is not enough; never letting a poisoned version onto disk is the real
  control, and that is the lockfile.
  - **Local (DONE 2026-08-05):** `.npmrc` sets `ignore-scripts=true` — no third-party code runs
    at install time, ever. The five packages in the tree that declare install scripts (`bcrypt`,
    `esbuild`, `fsevents`, `msw`, `unrs-resolver`) all work without them on Linux — verified by
    running the full gate on a scriptless `npm ci` — because modern native modules ship binaries
    as ordinary platform packages. `npm run rebuild:native` is the explicit, reviewed allowlist
    for platforms where a prebuild is missing. Consequence of the `.npmrc`: root `prepare` no
    longer fires, so a fresh clone runs `npm run build:shared` by hand.
  - **Practice:** `npm ci` is the only routine install command; `npm install` happens only when
    deliberately changing dependencies, and the lockfile diff is reviewed as code — it is the
    security boundary. New releases get a ~7-day cooldown before adoption (every npm
    supply-chain attack to date was unpublished within days); when Renovate/Dependabot arrives it
    enforces this (`minimumReleaseAge` / cooldown), and its PRs are never auto-merged.
  - **CI (binds D5's workflow):** `npm ci --ignore-scripts`; third-party actions pinned by commit
    SHA, never tag; workflow-level `permissions: {}` with per-job escalation; deploy credentials
    via OIDC, no long-lived secrets in runner memory; provenance badges and `npm audit` are not
    defences against a fresh compromise and must not be treated as such.

---

## Sequencing summary

```
A (security)  ── A1,A2 first (A2 before billing hooks) ── A3,A4 ── A5,A6 ── A7 ── A8
      │
B (test net)  ── B1 (wrong-role) is the keystone ── B2..B6           ← before any refactor
      │
C (services)  ── C1 ── C2 ── C3 ── C4 — ALL DONE ── A1 part 1 (refresh endpoint) DONE
      │
D (rest)      ── D2 org soft-delete DONE + A2 clean == BILLING UNBLOCKED
                 D1 schema single-source DONE ── D3 features DONE ── D4 lint ── D5 docs/CI ── D6
                 D7 supply chain: local half DONE, CI half binds D5
```

**Billing is unblocked once A2 (hook file clean) and D2 (org soft-delete) are done** — those two
are the only hard prerequisites. Everything else can proceed in parallel with early billing slices,
but doing A and B before C is not optional: refactoring auth without the boundary net is how a
silent role regression ships.

---

## Post-plan addenda

**2026-08-10 — four fixes from the skoped Step-1 port review** (two independent review
passes over the ported A6/A3/S10/S11 diff found these; they existed identically here, so
both repos took them in the same session and stay in lockstep):

- **S11 range bound:** `BCRYPT_COST` now bounded to bcrypt's valid 4–31 — `envNumber`
  gained optional `min`/`max` (shared by boot check and read site), `validateEnv` refuses
  out-of-range, `getBcryptCost` falls back to 12. A typo like `120` previously booted
  clean and made every hash take effectively forever.
- **Generic 500 bodies:** `handleCustomError` no longer echoes 500 messages (operator
  detail — env-var names, driver errors) to the caller: non-dev 500s answer
  `{ status, message: "Internal server error", requestId }`; `NODE_ENV=development`
  keeps the real message; logging unchanged. 502/503 messages are deliberately
  client-facing and still pass through. New `errorHandling.test.ts` pins the contract.
- **S10 compiler enforcement:** `SafeUser`/`SafeAdmin` moved from `services/index.ts`
  to `types/` and widened to `Omit<…, "password_hash" | "mfa_secret">`; all projected
  model return types use them, so reading `mfa_secret` off a projected row is now a
  type error.
- **A3/S3 comment:** `oauthPending.ts` documents that the no-key-confusion property
  rests on every `MFA_CHALLENGE_KEY`-signed token type carrying a distinct, verified
  `type` claim.

**2026-08-10 — A1 grace-window review fixes** (multi-agent adversarial review of the
skoped Step-2 port; the grace logic here was byte-identical, so all fixes landed here
first and were mirrored there):

- **Logout race closed:** the successor-liveness probe now takes `FOR UPDATE` and
  `revokeUserTokens` loops until a pass revokes nothing — without the pair, a
  within-grace refresh racing a logout could mint a token the logout's single UPDATE
  pass (whose snapshot predates the insert) never saw.
- **Breach revocation moved outside the transaction:** awaiting a second pool
  connection while `withTransaction` held one let ~pool-size concurrent replays wedge
  the whole pool; `createAccessToken` now returns a breach outcome and revokes after
  the connection is released, with the revoke guarded (breach `warn` on success, a
  deliberate revocation-FAILED `error` on failure) so a failed revoke can't soften
  the breach 401 or vanish from the logs.
- **Expiry enforced on the grace path** (an expired parent within grace of rotation
  no longer buys a fresh full-lifetime lineage; outside-grace still wins first so an
  expired replay trips breach detection), with a CRUD test.
- **All grace/expiry arithmetic moved to the DB clock** (`NOW()`-based, and rotation
  stamps `used_at = NOW()`), immune to app-instance clock skew.
- **`REFRESH_REUSE_GRACE_SECONDS` bounded 1–300** at boot and read site — a units
  typo (30000 "ms") previously disabled breach detection silently.
- **Migration 006:** partial index on `refresh(replaced_by)` (002's FK was
  unindexed) + the purge-ordering constraint documented.
- Double-log wrappers dropped from the revoke helpers (error middleware owns error
  logging).

**2026-08-10 — A4/S4 review fixes** (review of the skoped Step-3 port; shared code,
fixed here first and mirrored):

- **Principal gate loads through the transaction client** — `getUserById`/
  `getAdminById` gained the standard optional `client` param; the pool read inside
  the held transaction was a happy-path variant of the breach-path pool wedge
  (~pool-size concurrent rotations starved each other permanently).
- **Refused rotations burn the presented token** via the outcome pattern (revoked
  after the transaction, guarded, then the 401): the gate previously threw before
  the token was retired, so any deactivation that bypassed the admin handler left
  every cookie dormant-but-live, resurrected wholesale on reactivation.
- **Gate predicate NULL-safe** (`!is_active`, not `=== false`) — is_active is
  nullable and a NULL row can't log in, so it must not rotate.
- **Admin updateUser revokes on `deleted_at`/`deactivated_at` too** — the schema
  lets both through, so a PUT could soft-delete with no revocation.
- **S4 tests pin the at-source mechanism** (DB rows dead immediately after the
  admin call + the revoked-token message) — verified they previously passed with
  the controller revocation deleted, riding on the rotation gate's identical 401.
- Known-broken, deferred: the admin password-update branch has never worked
  (modifyUser 403s any password_hash patch) — feeds the D3 remove-vs-fix decision.

**2026-08-10 — A2/invitation review fixes** (review of the skoped Step-4 port; shared
code, mirrored here):

- **`isAccountActive` extracted to `utils/`** at its third consumer (per the Step-3
  deferral): `issueSession`, the rotation gate and the invitation-accept path all use
  the one NULL-safe predicate. (The OAuth/MFA-verify gates the skoped review flagged
  are already structural here — every verify path re-loads the principal and routes
  through `issueSession`.)
- **bcrypt hoisted out of the FOR UPDATE window** in `acceptInvitation`: all password
  CPU (compare + hash) now runs against a pool pre-read before the transaction, which
  re-validates the token under the lock — ~pool-size concurrent accepts of one token
  could previously stall every endpoint for the bcrypt duration.
- **D2 dead-org guard centralised into `validateInvitationToken`** — it lived in the
  service/controller bodies while `verifyToken` (same validator) reported a dead-org
  invite token as "valid"; the fake validator in the service unit test now models it.
- **Passwordless (OAuth-only) invitee answers 401, not a bcrypt 500** — the accept
  path's existing-user branch compared against a NULL hash.
- **`getUserWithPassword`/`getOrganizationById` gained the optional `client` param**
  (the A4 pool-wedge class, closed at its remaining read sites).
- **Accept response contract single-sourced**: `acceptInviteResponseSchema` in shared;
  the web union derives from it. `isMfaRequired` widened past `LoginResponse`;
  AcceptInvitePage routes `mfa_required` into the armed `/mfa-verify` flow
  (`startMfaChallenge`), with the redirect pinned through the real MfaVerifyPage gate;
  the `mfa_required` branch no longer fires a guaranteed-401 `/auth/me` refetch.
- Deferred (skoped review, applies here identically): mint-time `is_existing_user`
  freeze (a user who self-registers between invite and accept can never accept — 409),
  and the in-memory-only `/mfa-verify` gate losing the hand-off on page refresh.

**2026-08-10 — A5/A7 review fixes** (review of the skoped Step-5 port; the challenge
code is shared, mirrored here):

- **Backup-code verify no longer wedges the pool**: `challenges.fail` ran on the pool
  while `completeLoginWithBackupCode` held its transaction client across a bcrypt
  loop — ~pool-size concurrent wrong-code requests each pinned a connection and
  awaited one more, forever. The bcrypt loop, fail-count write and principal read all
  run before the transaction now; only burn + consume + issue are transactional.
- **`connectionTimeoutMillis: 10s` on the pool** (was 0 = wait forever): class-wide
  blast-radius cap — an acquire-while-holding burst now degrades to bounded 500s
  instead of a restart-only outage.
- **`authLimiter` on both `/mfa/disable` routes**: the A5/S8 password check made the
  route a password-guessing oracle for a stolen session at the global limiter's rate
  (~48k guesses/day) — the only password-accepting surface without it.
- **Attempt cap enforced in the UPDATE predicate** (`consumed_at IS NULL AND
failed_attempts < $2`): the guard's plain SELECT was check-then-act — K concurrent
  guesses all passed before any increment landed. CRUD test pins the cap.
- **Challenge expiry on the DB clock, row-side**: `expires_at` written as
  `NOW() + make_interval`, consume CAS gains `expires_at > NOW()`, guard checks a
  DB-computed `is_expired` — clock skew could previously sweep a still-valid
  challenge (GC compared an app-clock timestamp) or honour a dead one.
- **GC out of transactions**: the expired-challenge sweep in
  `createMfaChallengeToken` is fire-and-forget on the pool, never the caller's
  client — inside the invitation-accept transaction it held table-wide GC row locks
  until commit.
- **TOTP consume+issue atomic** (`completeLoginWithTotp` wraps them in
  `runTransaction`): a transient failure after a correct code burned the challenge
  with no session. Semantics change, pinned in the unit suite: a principal refusal
  now rolls the consume back — the surviving challenge is inert because
  `issueSession` structurally refuses it.
- Known-loose, left as-is: migration 003's `role_type` has no CHECK (immutable once
  merged; skoped's renumbered copy gained `IN ('user','admin')` pre-commit — adopt in
  a future migration if the column ever gets a second writer).
- Deferred: a single `verifyAndConsumeMfaChallenge` seam owning the
  guard → fail → consume sequence and the pool-vs-client decision (C2 territory);
  the 8-site `verifyPrincipalPassword` step-up extraction (C1/C2).

**2026-08-11 — OAuth deactivation gate reverse-ported from skoped** (skoped Step-8
divergence adopted; both repos now share one contract):

- **The Google callback and link paths refuse a deactivated account up front**
  (403 "Account is deactivated") instead of the inherited challenge-first
  behaviour, which issued an MFA challenge a deactivated account could never
  complete (`issueSession` refused at the end regardless). No enumeration cost:
  the caller has already authenticated as the Google account's owner by the time
  either gate fires. Deliberate contract change — the pinned specs moved with it:
  the OAuth+MFA flow fixture now activates BOB for its duration, and a new spec
  pins the deactivated-with-MFA case (403, no `mfa_challenge` cookie, no
  challenge row — the refusal precedes A7's mint, not just the cookie).
- `startSession`'s MFA-first ordering is unchanged; its comment no longer cites
  the retired OAuth contract as justification (structural refusal at
  `issueSession` is the invariant, early caller gates are the UX).
- The `needs_linking` callback branch stays ungated (matches skoped): the link
  attempt itself is where the account is identified and refused.
