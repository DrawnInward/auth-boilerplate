# Phase 0 / auth-boilerplate audit — 2026-07-29

Verified against `auth-boilerplate@b5684a7` (main). Method: full five-command gate run locally, plus four
independent code audits (migrations/contract/utils, services + frontend platform, test coverage matrix,
functional completeness). Every finding below was taken from the code with file:line evidence, not from the
docs; the most consequential ones were independently re-verified.

## 1. The gate and the headline claims — honest

- `format:check` clean, `typecheck` clean, `lint` 0 errors / 63 warnings, **587/587 API tests, 31/31 web tests**
  — exactly what `docs/platform-uplift.md` claims.
- Caveat: this machine had no `node_modules`, no `.env.test`, and no databases — the gate could not have been
  run here as found. `npm install` + `npm run setup` fixed it (created `auth_boilerplate_db` /
  `test_auth_boilerplate_db`).
- **There is no CI runner.** No `.github/`, no workflow files. "CI gate — done" means npm scripts exist;
  nothing runs them on push. Phase 0.6 as written implies automation that doesn't exist.

## 2. Phase 0 item-by-item verdict

| Item                          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1 Migrations                | **Done.** Only DDL is `migrations/001_boilerplate_schema.sql`; runner correct (filename order, per-file transaction, recorded on success); seed owns no DDL. Minor: `build`'s `cp -r` nests on a second build without a clean; no `node dist/run-migrate.js` production entrypoint (migrate is ts-node-only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.2 Contract de-dup           | **Partially done — live drift remains.** The three named duplicates were removed and vocabularies re-exported, but `api/src/types/{Invitation,User,Admin}.ts` still re-declare ~14 pure-DTO schemas that exist in shared (`registerSchema`, `loginUserSchema`, `changePasswordSchema`, `inviteMemberSchema`, …). The API validates with its copies while the web validates with shared's, and they have already diverged (`.email()` message differs → different 400 bodies than the client predicts). `ValidationErrorResponse.ts` is a byte-level duplicate of shared's `Response.ts`. `PaginationOptions` exists twice under the same name with _different_ rules (api: no max; shared: max 1000, strict). Two admin request schemas (`adminInviteUserSchema`, `updateUserSchema`) live only in the API, so the frontend hand-rolled copies (`AdminUsersPage.tsx:35`, `AdminUserDetailPage.tsx:46`) — exactly the drift class 0.2 was meant to close. `mfaRequiredResponseSchema` in shared is dead **and wrong-shaped** vs the actual wire format. |
| 0.3 Platform utils            | **Done, 4 stragglers.** All nine utils exist, are consumed, and the sweeps are near-total (zero `throw {}` literals, zero raw pg-code checks, zero console.* outside sanctioned files, zero `as any`). Remaining: `middleware/authoriseUser.ts:37,73,77` emit `{msg}` error bodies bypassing the error middleware — auth failures are the one response shape a client can't parse uniformly; `models/refresh.models.ts:64-72` hand-counts placeholders with **no column allow-list** (interpolates `Object.keys()` of the caller's object); `oauth.controller.ts:68` reads `req.query` raw (doc admits this); `organizationMiddleware.ts:18,52` keep two `as string` param casts. Env gaps: `MFA_ENCRYPTION_KEY` is presence-checked but not format-checked (wrong-length key boots fine, 500s on first MFA request); creation-mode typos silently fall back to `"open"` (a typo'd `invite_only` opens registration); `validateEnv` runs only in `server.ts`, so the integration suite and any alternate entrypoint run unvalidated.                   |
| 0.4 Services layer            | **A service, not a layer.** The email adapter is genuinely excellent (pure builders, one seam, Memory fake, 18 tests, `sendEmail.ts` deleted). But it is the _only_ service: ~27 of 73 handlers still carry multi-step business logic, 21 of 22 `withTransaction` sites live in controllers. Obvious next extractions: token minting (12 `jwt.sign` sites, 17 raw env-key reads across 5 controllers), the twin ~280-line user/admin MFA controllers, `acceptInvitation` (the largest orchestration in the repo). Also: `auth.controller.ts:755-758` runs raw SQL in a controller, bypassing the models layer entirely; `utils/googleOAuth.ts` is an un-seamed hand-rolled adapter (reads env internally, imported straight into controllers — the exact pre-uplift defect email had). Four multi-step flows run without a transaction: `register`, `forgotPassword`, `requestEmailChange`, `inviteMember`.                                                                                                                                            |
| 0.5 Frontend platform         | **Done as claimed, thinly.** Layering is genuinely clean (HTTP only in `api/client.ts`, zero cross-feature imports, tiers respected) but **enforced by discipline only** — no `no-restricted-imports`/boundaries lint, so the next violation ships silently. `orgKeys` adopted, but 8 hand-built key families remain (doc lists 2), three of them outside `api/queries/` in `AuthContext.tsx`. 4 of 18 forms use local schemas where shared (or API-only) ones exist. `AdminAuthContext` was left behind in `features/admin` while `AuthContext` was promoted — two conventions for the same concern. `components/ui` is kebab-case, contradicting "no grandfathered exceptions" (defensible — shadcn regenerates them — but the claim is stated universally).                                                                                                                                                                                                                                                                                         |
| 0.6 CI gate + conventions doc | **Half done.** Gate scripts exist and pass; **the conventions doc does not exist upstream.** `docs/` holds only `api-reference.md` and `platform-uplift.md`; README is user-facing setup docs. The plan called the conventions doc "a deliverable, not a nicety" and the exit criterion says "a conventions doc exists". Today the conventions live only in the fork's `CLAUDE.md`, which itself admits it's a hand-maintained copy that must be synced by hand — the exact failure mode the upstream doc was meant to prevent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## 3. Testing strategy — deep but narrow

The 587 are real and well-built where they exist (nothing mocks the pool; web mocks nothing but the HTTP
boundary; MSW handlers genuinely parse with shared schemas). But:

- **26 of 73 endpoints (36%) have zero test traffic.** Two route groups have no spec at all:
  `admin/organizations.routes.ts` (10 endpoints — full CRUD over every org, including hard delete) and
  `admin/mfa.routes.ts` (7 endpoints). Admin MFA is entirely untested end-to-end while user MFA has 16 tests.
- **403-wrong-role is never tested at the platform boundary, repo-wide.** No test presents a user cookie to an
  admin route or vice versa. A regression swapping `authoriseUser(["admin"])` for `["user"])` on any admin
  route ships green. This is the single most load-bearing gap given "the inherited suite is the contract".
- **Cross-org isolation is asserted exactly once** in the whole repo (org-invitation cancel). None of the eight
  `:organizationId` member/detail endpoints has a cross-org test; the model layer has none at all ("org A never
  sees org B rows" is a stated per-model minimum — currently asserted nowhere in CRUD).
- **Security-critical pure logic has zero unit tests:** `mfaChallenge.ts`, `totp.ts`, `encryption.ts`,
  `backupCodes.ts`, `determinateHash.ts`, `sanitizeUrl.ts`, `parseCookies.ts`, `pgErrors.ts` (whose typed
  helpers are never used in any assertion — every constraint test is a bare `.rejects.toThrow()`).
- `PUT /auth/change-password` and `PUT /auth/profile` — the two authenticated self-account mutations — have
  zero coverage. Rate-limiter config is exported for testability and never asserted (limiters are disabled
  under test, so a typo'd `max` ships green).
- Web: `AdminRoute` untested (its sibling `ProtectedRoute` has 4 tests); MFA flows, invitation-accept page,
  all 7 admin pages, all 9 forms' error states, and every async _error_ path untested. MSW handler file covers
  only `/auth/me` + 7 org endpoints, and `onUnhandledRequest: "error"` means each new area needs handlers first.

## 4. Functional completeness of the auth product — the real gap

The backend kernel is credible: unified invitation-token model, refresh rotation with replay detection
(`FOR UPDATE`, revoke-all on replay), AES-256-GCM MFA secrets at rest, bcrypt-hashed single-use backup codes,
challenge JWTs on a separate key with role cross-checks, a deliberately non-assignable `owner` role with
atomic ownership transfer, session revocation on password change/reset, enumeration-safe forgot-password.

But the product around it has holes, ranked:

1. **OAuth is unusable from the shipped UI.** The Google button is `<a href>` to an API route that returns
   JSON (`LoginPage.tsx:58`); the callback also answers JSON and the SPA has no callback route; Unlink is a GET
   anchor at a POST-only route (404); the `needs_linking` flow has no UI at all.
2. **The admin half is a login screen bolted onto an unrouted model file.** `admins.models.ts` is 391 lines of
   which only two functions are ever imported. No admin listing/create/disable/delete, no admin password
   change or forgot-password, no last-admin protection, no admin-MFA UI; the `root` flag is minted into the
   JWT and never checked anywhere. Admins can only be created by `npm run seed`.
3. **Admin dashboard user stats call a nonexistent endpoint** (`/admin/users/stats` → falls through to
   `GET /:userId` → UUID 400; tiles permanently show 0). `getUserStats` exists in the model, unrouted.
4. **Admin "set user password" always 403s** — the controller maps `password` → `password_hash` and
   `modifyUser`'s first statement throws on `password_hash`. Untested, so invisible.
5. **`PUT /auth/profile` is a no-op** — validates a body, ignores it, returns the current profile.
6. Missing inverses: no `POST /auth/refresh` (rotation only as a middleware side effect — documented but
   nonexistent), no resend-verification, no cancel-pending-email-change, no decline-invitation, no
   self-service account deletion, no UI for `org-permission` despite README pointing operators at it.
7. **Organizations are hard-deleted** — no `deleted_at` column; `deleteOrganization` cascades. **This directly
   contradicts the fork CLAUDE.md's "Organizations are never hard-deleted" invariant, and billing will FK
   financial history to organizations.** Either the FK blocks admin org-delete (500) or a cascade destroys
   money history. Must be resolved upstream before billing tables land.

### Security findings (each verified with file:line)

- **S1 — Concurrent requests log users out.** Refresh rotation happens inline in `authoriseUser`; an SPA
  firing parallel queries after access-token expiry sends the same refresh cookie twice; the second request
  hits the replay branch and **revokes every session** for that user. Correct anti-replay logic, wrong
  trigger — normal browser concurrency is indistinguishable from theft. Needs a serialised refresh endpoint
  or a grace window.
- **S2 — MFA bypass via org-invitation accept.** `POST /invitations/:token/accept` authenticates an existing
  user with token + password and issues full auth cookies with no MFA challenge and no `is_active` check.
  Login, OAuth and linking all enforce MFA; this path doesn't. (This is also one of the six seat-policy hook
  files — fix it upstream _before_ the hooks land, or every merge conflicts.)
- **S3 — `oauth_pending` cookie is forgeable.** Plain base64 `{google_id, email}`, no MAC, trusted verbatim
  by the unauthenticated link route — lets a user bind someone else's Google identity to their own account,
  hijacking the victim's future Google sign-ins.
- **S4 — Deactivated/deleted users keep working sessions indefinitely.** Nothing re-checks
  `is_active`/`deleted_at` on token refresh, and admin disable/delete never revokes tokens; each rotation
  mints a fresh 7-day refresh token. (Billing consequence: "suspended" enforcement will inherit this.)
- **S8 — MFA disable requires only a single backup code** — no password, no TOTP, despite the API reference
  claiming both. A stolen session + one leaked backup code silently removes the second factor.
- **S9 — MFA challenge token replayable** within its 5-minute window (no jti/nonce, nothing server-side;
  failed verify leaves it valid).
- S5 — registration/email-change return 409 for existing emails while forgot-password is enumeration-safe
  (one endpoint leaks what the other protects). S6 — no helmet, no CSRF token (sameSite=lax outside
  production). S7 — malformed access-token cookie throws outside the try in `authoriseUser` → unauthenticated
  500 on every request until the cookie is cleared. S10 — admin user listings return `mfa_secret` ciphertext
  (`SELECT *` minus only `password_hash`). S11 — bcrypt cost 10, hard-coded.
- Clean: no secrets logged (pino redaction verified); vendor SDK isolation holds; `transfer-ownership` and
  `org-permission` routes lack `validateBody` (500/unvalidated body respectively).

### Doc drift

`README.md` and `docs/api-reference.md` describe an API that doesn't exist: a `{success: true, msg}` envelope
the code has never emitted (actual: `{status, message, data}`), `POST /auth/refresh`, `search` filters and
list envelopes on admin endpoints, `{password, code}` on MFA disable, wrong route shape for admin
reset-password, wrong field names (`new_email` vs `newEmail`), wrong response shapes on ~8 endpoints, README
still pointing at `seed.ts` for schema and at the pre-uplift `features/auth` context path. The two rate
limiters README describes as applied are defined and never used.

## 5. What this means for the plan

The plan itself survives the audit. Fork topology, additive-billing discipline, ManualProvider-as-null-
implementation, money-integer rules, the nine money-test classes, engine-generated fixtures — all still right,
and nothing found here invalidates a Phase 1+ decision. Three corrections:

1. **"Phase 0 done in full" was true of Phase 0's own checklist, not of the foundation.** The uplift was
   honestly executed and honestly documented (its own "still open" list was accurate as far as it went), but
   Phase 0 was scoped as _platform mechanics_, and the exit criterion "all upstream suites green" measured the
   wrong thing — the suites cover 55% of the surface and never test the role boundary. The confidence the plan
   wants ("reusable boilerplate we can have confidence in") needs a hardening pass upstream before or alongside
   Phase 1, not after.
2. **The org hard-delete contradiction is a blocker for billing schema work** (see §4.7).
3. **The conventions doc and CI runner are unfinished Phase 0 deliverables** — and the conventions doc's
   absence upstream is why the fork's CLAUDE.md is already carrying a hand-synced copy.

### Recommended upstream "Phase 0.7" (all platform, all public-repo-eligible, ordered)

1. Security fixes: S2 (invitation MFA bypass — do this before seat-policy hooks touch that file), S1
   (dedicated refresh endpoint or grace window), S3 (sign the oauth_pending cookie), S4 (re-check
   `is_active`/revoke on disable), S8 (require password on MFA disable), S7 (move the decode inside the try).
2. `organizations.deleted_at` + soft-delete semantics (billing prerequisite).
3. Test the boundary: wrong-role 403 matrix across all route groups; specs for `admin/organizations` and
   `admin/mfa`; cross-org matrix for the eight org-scoped endpoints; unit tests for the MFA/token crypto utils.
4. Finish or cut broken features: wire `/admin/users/stats`, fix or remove the admin set-password path and the
   no-op profile endpoint, fix the OAuth UI (or gate OAuth off by default until it has one), decide the admin
   management slice (listing/create/disable + last-admin protection) since "B2B multi-tenant" implies it.
5. Close 0.2 properly: move the ~14 duplicated DTO schemas + 2 admin request schemas to shared, delete the
   dead/wrong `mfaRequiredResponseSchema`, collapse `PaginationOptions`.
6. Write the conventions doc upstream; regenerate README/api-reference from the actual API; add a GitHub
   Actions workflow running the five commands.

Items 1, 4 and the wrong-role matrix are the ones I'd treat as blocking Phase 1 schema/hook work; the rest can
run in parallel with early billing slices.
