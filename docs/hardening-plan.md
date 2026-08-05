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
- **D2 · Organizations soft-delete (billing prerequisite).** Add `deleted_at` to `organizations`,
  filter it everywhere, convert `deleteOrganization` from hard cascade to soft delete. Billing will
  FK financial history to organizations, so a hard cascade would either be blocked by the FK (500) or
  destroy money history. Do this before billing schema lands. Aligns with the fork's stated
  "organizations are never hard-deleted" invariant.
- **D3 · Finish or cut the broken features** the audit found — decide per feature, don't ship
  half-wired: wire `/admin/users/stats` (model exists, unrouted → dashboard tiles stuck at 0);
  fix or remove admin set-user-password (always 403s today) and the no-op `PUT /auth/profile`; fix
  the OAuth UI end-to-end (button posts to a JSON route, no SPA callback route, Unlink is a GET to a
  POST route) or gate OAuth off by default until it has a working UI; decide the admin-management
  slice (listing/create/disable + last-admin protection) since "B2B multi-tenant" implies it and the
  `admins` model is 391 lines of which two functions are routed.
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
C (services)  ── C1 ── C2 ── C3 ── C4 — ALL DONE (A1 part 1, the refresh endpoint, still open)
      │
D (rest)      ── D2 org soft-delete + A2 clean == billing unblocked
                 D1 schema single-source ── D3 features ── D4 lint ── D5 docs/CI ── D6
                 D7 supply chain: local half DONE, CI half binds D5
```

**Billing is unblocked once A2 (hook file clean) and D2 (org soft-delete) are done** — those two
are the only hard prerequisites. Everything else can proceed in parallel with early billing slices,
but doing A and B before C is not optional: refactoring auth without the boundary net is how a
silent role regression ships.
