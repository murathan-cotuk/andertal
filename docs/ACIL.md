# ACIL — Andertal Refactor and Security Task Board

## TL;DR for the next agent (60 second read)

This file is a cross-PC, cross-session task board. Multiple agents work on it. Read this whole file before starting, then pick the next [ ] item.

Sprint order (do not skip):
1. SPRINT 1 — Critical security (must complete before SPRINT 4)
2. SPRINT 2 — Refactor and cleanup
3. SPRINT 3 — TALIMAT.md bug fixes
4. SPRINT 4 — Strategic platforms (developer.andertal.com + affiliate.andertal.com)

References:
- docs/TALIMAT.md — user-written bug list (referenced by SPRINT 3)
- docs/developer.md — full spec for developer platform (SPRINT 4.1)
- docs/affiliate.md — full spec for affiliate platform (SPRINT 4.2)
- README.md — project overview (note: it says "Medusa v2 backend" but package.json says "mock"; see S2.7)

---

## ONBOARDING for a fresh agent on a different PC

If you are picking this up on a new machine and have never seen this project before, run these steps **in order** before you start coding:

1. **Pull latest** — `git fetch --all && git status`. Active branch is recorded in STATUS SNAPSHOT below. If you don't see it locally:
   - It may live only on the original machine (see "Pushed to remote" field). Ask the user to push, or merge the branch in via the user's preferred path.
   - As of 2026-06-24, branch `fix/s1-1-rotate-secrets` (5 commits: see COMMIT MAP) has never been pushed. To bring it to a new PC the user must either `git push -u origin fix/s1-1-rotate-secrets` from the original machine or carry the work over manually.
2. **Read the docs**, in this order: this file (ACIL.md, top to bottom), then `docs/TALIMAT.md`, `docs/developer.md`, `docs/affiliate.md`. Each is 50–500 lines.
3. **Install dependencies** — `npm install` at the repo root (turborepo workspaces).
4. **Local DB** — Postgres at `localhost:5432`, database `medusa`. See `apps/medusa-backend/.env.example` for the connection string.
5. **Start the stack** — `npm run dev` at root spins up turbo with shop (3000), sellercentral (3002), medusa-backend (9000).
6. **Smoke test** — open `http://localhost:3000` (shop) and `http://localhost:3002/de/login` (sellercentral). Both should load.
7. **Then start work** by picking the first `[ ]` task in SPRINT 1 order, marking it `[->]`, doing it, and following WORKING RULES below.

**Never push to `main`. Never force-push. Never amend commits that you already pushed.** See WORKING RULES.

---

## COMMIT MAP (work already done on branch `fix/s1-1-rotate-secrets`)

| Task | Commit SHA | Title |
|------|-----------|-------|
| S1.1 | `1a8bc42` | fix(security): rotate JWT/cookie secrets and enforce env in production |
| S1.2 | `578b3ec` | fix(security): verify JWT signature in sellercentral middleware |
| S1.3 | `5f04748` | fix(security): add /admin-hub auth gatekeeper to close unprotected routes |
| S1.4 | `f1c84df` | feat(observability): wire Sentry into backend and sellercentral |
| S1.5 | `00b7228` | chore(security): move hardcoded LAN IPs out of production code |

Inspect any commit with `git show <sha> --stat` for the file list, or `git show <sha>` for full diff.

The branch base is `main` HEAD `07e89ef`. Run `git diff main..HEAD --stat` on the branch to see the full cumulative diff of all 5 tasks.

The test scripts cited in each task's "Acceptance" section were created in `C:\Users\murat\AppData\Local\Temp\andertal-*-test.js` and deleted after passing. They are NOT in the repo. To re-verify, recreate them from the inline descriptions in this file or run the verification commands documented in each AGENT NOTES block.

---

## STATUS SNAPSHOT (every agent updates this at end of session)

- Last update: 2026-06-24 by Agent-1 (Cursor on Murathan's main PC)
- Active task: none (S1.1 + S1.2 + S1.3 + S1.4 + S1.5 finished, awaiting "continue?" decision)
- Blocking decisions: none yet
- Active branch: `fix/s1-1-rotate-secrets` (per user request, multiple sprint-1 tasks share one branch to keep PR count low)
- Pushed to remote: NO (awaiting user push approval — if a new agent on a different PC cannot see the branch, this is the reason)
- Working tree extras: `apps/medusa-backend/src/order-pdf-*.js` (3 files) have unstaged changes from a prior session — NOT touched by this work, leave alone unless the user says otherwise
- Stash present: `stash@{0}: On main: temp-before-rebase-for-push` — also from a prior session
- Next pending tasks (any order, but SPRINT 1 first): S1.3b admin-route follow-up, S1.4b shop DSN migration, S1.6 CI, S1.7 logger
- All other sprints untouched

---

## LEGEND

- `[ ]` not started
- `[->]` in progress (do not start another agent on the same task)
- `[x]` done
- `[!]` blocked (waiting on human decision)
- `[-]` cancelled or skipped (reason in notes)

---

## WORKING RULES (mandatory for every agent)

1. Create a feature branch: `fix/<sprint>-<task-id>-<short-slug>`. Example: `fix/s1-1-rotate-secrets`.
2. NEVER push to `main` directly. NEVER force-push. NEVER amend pushed commits.
3. One task = one branch = one commit set (logical grouping; may be multiple commits if needed).
4. Do not run destructive commands (db migrations on prod, force resets) without explicit user confirmation.
5. Before marking `[x]`, run the project lint and any relevant tests locally.
6. After completing a task:
   - Flip checkbox to `[x]`
   - Add an `AGENT NOTES (task-id)` block under the task with: branch name, commit SHA, files changed, how to verify, how to rollback.
7. If a task needs human decision: flip to `[!]`, add `BLOCKING (task-id)` block with: what decision is needed, default suggestion, why.
8. Cross-doc rule: if you change a decision recorded in TALIMAT/developer/affiliate, log it under `DECISION CHANGES` at bottom of this file.
9. At end of every session: update STATUS SNAPSHOT.

---

## SPRINT 1 — CRITICAL SECURITY AND FOUNDATION

Goal: close production-blocking security holes, give CI teeth, give backend observability.

### S1.1 — Rotate hardcoded JWT and cookie secrets [x]

Problem: `apps/medusa-backend/medusa-config.js` lines 56-62 contained hardcoded fallback values for `jwtSecret` and `cookieSecret`. The repo is public. Anyone could forge tokens if env vars were not set in production.

Subtasks:
- [x] Edit `apps/medusa-backend/medusa-config.js`: removed `|| "hardcoded-string"` fallback. Added `readSecretOrFail()` helper — fail-fast in production, dev placeholder + warning in development.
- [x] Edit `apps/medusa-backend/.env.example`: rewrote with full required env list including JWT_SECRET, SELLER_JWT_SECRET, CUSTOMER_JWT_SECRET, COOKIE_SECRET, TOTP_ENCRYPTION_KEY, and CORS settings. Added generation command in comments.
- [x] Edit `README.md`: replaced the thin Security section with a detailed required-secrets table, generation commands, and a clear history note about the compromised values.
- [x] Verified `git grep "v9jGV"` and `git grep "qR1it"` return no matches in source code.

Acceptance:
- [x] Running with `NODE_ENV=production` and no `JWT_SECRET` causes exit code 1 with: `[SECURITY] JWT_SECRET is missing or shorter than 32 chars. Generate one with: node -e "..." and set it in your deployment environment before starting the server.`
- [x] Running with `NODE_ENV=production` + valid env vars: exit 0, config loads, jwt/cookie length 37 (test values).
- [x] Running in dev (no NODE_ENV): exit 0, warning logged, fallback placeholder used.
- [x] No hardcoded secret strings remain in source.

Risk realized: Zero impact on dev workflows. Production must set env vars before next deploy — see USER ACTION REQUIRED below.

### AGENT NOTES (S1.1)

- Branch: `fix/s1-1-rotate-secrets`
- Files changed:
  - `apps/medusa-backend/medusa-config.js` — new `readSecretOrFail()` helper + removed hardcoded fallbacks at lines 56-62 of the previous version
  - `apps/medusa-backend/.env.example` — full rewrite with required env list and generation commands
  - `README.md` — new Security section with required-secrets table and rotation history note
  - `docs/ACIL.md` — this file (created + S1.1 marked done)
- Verification commands:
  ```powershell
  # Dev mode — should warn and load
  node -e "require('./apps/medusa-backend/medusa-config.js')"

  # Prod without env — should exit 1
  $env:NODE_ENV='production'; node -e "require('./apps/medusa-backend/medusa-config.js')"; $env:NODE_ENV=$null

  # Prod with env — should load OK
  $env:NODE_ENV='production'; $env:JWT_SECRET='test-secret-32-characters-or-more-yes'; $env:COOKIE_SECRET='another-test-secret-at-least-32-chars'; node -e "require('./apps/medusa-backend/medusa-config.js')"
  ```
- Rollback: `git revert <commit-sha>` on `fix/s1-1-rotate-secrets` branch. The previous hardcoded fallbacks are gone from source (intentional) and rolling back would re-introduce them, so prefer setting env vars over rolling back.

### USER ACTION REQUIRED (before next production deploy)

1. Generate fresh secrets locally:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Run that command four times (or use unique ones) for: `JWT_SECRET`, `SELLER_JWT_SECRET`, `CUSTOMER_JWT_SECRET`, `COOKIE_SECRET`.
2. Also generate TOTP key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   For `TOTP_ENCRYPTION_KEY`.
3. Update Render dashboard env vars on the medusa-backend service.
4. Deploy. **Note**: rotating secrets invalidates all active user sessions — plan a maintenance window or notify users to re-login.
5. Add to ACIL.md `CHANGE LOG` the deploy timestamp.

---

### S1.2 — Sellercentral middleware: verify JWT signature [x]

Problem: `apps/sellercentral/src/middleware.js` only checked cookie presence (`if (!token)`), never verified signature or expiration. Setting any value as `sc_token` cookie bypassed auth at the middleware level.

Subtasks:
- [x] Add `jose@^5` (Edge-runtime-compatible — uses Web Crypto under the hood) to sellercentral deps.
- [x] Rewrite middleware: verify JWT signature using `SELLER_JWT_SECRET || JWT_SECRET` (HS256, matches backend's existing `signSellerToken` in `server.js:5582-5588`).
- [x] On invalid/expired token: redirect to login AND clear the `sc_token` cookie (maxAge=0).
- [x] Production fail-safe: if secret unset in prod, log [middleware] error and treat all tokens as invalid (denial-of-access, not denial-of-security).
- [x] Dev fallback: same placeholder secret as backend (`dev-only-seller-secret-do-not-use-in-prod`) so local dev tokens validate without env config.
- [x] Add `SELLER_JWT_SECRET` / `JWT_SECRET` to `apps/sellercentral/.env.example`.

Acceptance — verified by `/tmp/andertal-middleware-test.js` (deleted after run), 7/7 pass:
- [x] Valid HS256 token signed by backend's `signSellerToken` verifies via jose. PASS
- [x] Tampered signature rejected (`ERR_JWS_SIGNATURE_VERIFICATION_FAILED`). PASS
- [x] Tampered body rejected. PASS
- [x] Expired token rejected (`ERR_JWT_EXPIRED`). PASS
- [x] Wrong secret rejected. PASS
- [x] Garbage / malformed token rejected (`ERR_JWS_INVALID`). PASS
- [x] `alg=none` confusion attack rejected (`ERR_JOSE_ALG_NOT_ALLOWED`) — critical. PASS

Risk realized: Medium. Anyone whose `JWT_SECRET` is misaligned between backend and sellercentral will be logged out. Mitigation: backend reads `SELLER_JWT_SECRET` then falls back to `JWT_SECRET`; middleware does the same; both default to the same dev placeholder. As long as production sets the *same* value on both, no drift.

### AGENT NOTES (S1.2)

- Branch: continued on `fix/s1-1-rotate-secrets` (kullanıcı tek branch istedi — S1.1 ile aynı branch).
- Files changed:
  - `apps/sellercentral/package.json` — added `jose: ^5.10.0`
  - `package-lock.json` (root) — auto-updated by npm
  - `apps/sellercentral/src/middleware.js` — full rewrite, now async, uses `jwtVerify`
  - `apps/sellercentral/.env.example` — added `SELLER_JWT_SECRET` and `JWT_SECRET` block with instructions
- Verification:
  - `npm run lint --workspace=apps/sellercentral` → clean
  - Custom token-roundtrip test (sign with backend's HMAC-SHA256, verify with jose): 7/7 pass
- USER ACTION REQUIRED:
  - On Vercel (or wherever sellercentral is hosted), set `SELLER_JWT_SECRET` (or `JWT_SECRET`) to the **same value** as the backend's secret.
  - If not set: middleware will redirect all authenticated requests to login (fails closed — correct behavior).

---

### S1.3 — Add auth gatekeeper to /admin-hub [x]

Problem: Many `httpApp.METHOD('/admin-hub/...')` registrations in `apps/medusa-backend/server.js` did not pass `requireSellerAuth`. Notably: categories (lines 2354-2364), collections (2982-2986), metafield-definitions (3225-3485), menus (3812-3819), seller-settings (5563-5564), order PDFs invoice+lieferschein (14601-14602), and others. Anyone hitting these endpoints could create/update/delete categories, menus, etc. Route-level `requireSellerAuth` was inconsistent — used on brands, banners, products, media, but missing elsewhere.

Subtasks:
- [x] Identified existing auth helper: `requireSellerAuth` at `server.js:5630` and `requireSuperuser` at `:5639`.
- [x] Inserted a path-prefix gatekeeper at `server.js:1746-1774` (right after the scope-setting middleware at `:1741`). Pattern: default-deny on `/admin-hub/*` unless the request matches `ADMIN_HUB_PUBLIC_PATTERNS` (login, register, billbee webhook), or is `OPTIONS` (CORS preflight). Falls back to `requireSellerAuth`.
- [x] Function-declaration hoisting confirmed: `requireSellerAuth` (declared at :5630) is accessible from the gatekeeper closure at request time even though the source line is later in the file.
- [x] `.ts` admin-hub handlers under `src/api/admin-hub/v1/` will also be protected because they are mounted on the same express app via Medusa's framework loader.

Acceptance — verified by `/tmp/andertal-gatekeeper-test.js` (deleted after run), 14/14 pass:
- [x] POST `/admin-hub/auth/login` passes without auth (200). PASS
- [x] POST `/admin-hub/auth/register` passes without auth (200). PASS
- [x] POST `/admin-hub/v1/integrations/billbee/webhook` passes without auth (200) — Billbee uses Basic Auth internally. PASS
- [x] GET `/admin-hub/v1/categories` without token → 401. PASS
- [x] POST `/admin-hub/v1/categories` without token → 401 (this was the original audit gap). PASS
- [x] DELETE `/admin-hub/v1/categories/:id` without token → 401. PASS
- [x] GET `/admin-hub/menus` without token → 401. PASS
- [x] GET `/admin-hub/v1/orders/:id/pdf/invoice` without token → 401 (PDF leak gap closed). PASS
- [x] Garbage token → 401. PASS
- [x] Expired token → 401. PASS
- [x] Valid token → handler runs and `req.sellerUser` is populated. PASS
- [x] Prefix smuggling attack `/admin-hub/auth/login-bypass/categories` → 401 (regex anchoring works). PASS
- [x] OPTIONS preflight → not blocked (200). PASS

Risk realized: Low to medium. Existing route-level `requireSellerAuth` on protected routes (brands, products, media, etc.) now runs twice — once via gatekeeper, once via the explicit middleware on the route. This is harmless but wasteful. See follow-up below.

### AGENT NOTES (S1.3)

- Branch: continued on `fix/s1-1-rotate-secrets`.
- Files changed:
  - `apps/medusa-backend/server.js` — inserted ~30 lines after the scope middleware (line 1745-1774 in the modified file). No other lines touched.
  - `docs/ACIL.md` — task marked done, follow-up task S1.3b added.
- Verification:
  - `node --check apps/medusa-backend/server.js` → clean.
  - Isolated express test harness mimicking the gatekeeper + 14 scenarios → 14/14 pass.
- USER ACTION REQUIRED: After deploy, hit `/admin-hub/v1/categories` from sellercentral admin pages without being logged in — expect login redirect (sellercentral middleware) instead of category data leak. After logging in, the same path should return data.
- Backward compatibility: If any code path inside sellercentral or shop was calling `/admin-hub/*` without a Bearer token (which would itself be a bug), it will now break with 401. Watch Sentry / logs after deploy.

### S1.3b (follow-up, NEW) — Clean up redundant route-level auth and protect /admin/* [ ]

Two follow-ups discovered while doing S1.3:

(a) Routes that already pass `requireSellerAuth` explicitly (e.g. `server.js:3101-3104` brands, `:5073-5251` products, `:11440-11449` media, `:13984-13986` sendcloud, `:14585-14588` shipping-groups, `:14597 reviews`, `:14603` provisionsfaktur, `:6132-6136` auth/me + 2FA endpoints, `:6137-6141` users, `:6369-6373` platform-checkout-settings, `:3117-3153` banners) now run `requireSellerAuth` twice (once via gatekeeper, once via explicit middleware). Harmless but wasteful. Cleanup: remove the now-redundant `requireSellerAuth` from each route registration. Keep `requireSuperuser` where present.

(b) `/admin/*` routes (e.g. `server.js:2427-2755`, ~7 routes) were intentionally left unprotected by the gatekeeper — they use a different `runHandler(...)` pattern that may rely on Medusa's own admin session. Need separate analysis: either remove those routes entirely (if dead code from the mock-Medusa migration), or add a proper Medusa-admin auth check.

Acceptance for S1.3b:
- [ ] Audit `/admin/*` routes: confirm whether they are reachable by live frontend code. If not, delete. If yes, add appropriate auth.
- [ ] (Optional) Remove redundant route-level `requireSellerAuth` calls in server.js — but only after gatekeeper is verified live on staging.

---

### S1.4 — Add Sentry to sellercentral and backend [x]

Problem: Sentry was only configured for the shop app, and even there with a hardcoded DSN. Sellercentral and backend errors were never captured.

Subtasks:
- [x] Sellercentral: added `@sentry/nextjs@^10.35.0`. Created `sentry.server.config.js`, `sentry.edge.config.js`, `instrumentation.js`, `instrumentation-client.js`. Wrapped `next.config.js` with `withSentryConfig` (tunnelRoute `/monitoring`, source maps hidden, sourcemap upload silent in non-CI).
- [x] Backend: added `@sentry/node@^10.35.0`. Initialized at the TOP of `server.js` (immediately after dotenv, before other requires so OpenTelemetry can patch them). Added `Sentry.setupExpressErrorHandler(httpApp)` just before `httpApp.listen(...)`.
- [x] All DSNs are env-driven — Sentry init is a hard no-op when env unset, so dev workflow is not affected.
- [x] Added Sentry env vars to both `.env.example` files with instructions and recommended defaults.

Design choices:
- DSN comes from env. NEXT_PUBLIC_SENTRY_DSN for sellercentral client (Sentry DSNs are public-by-design — they identify the project, not a credential), SENTRY_DSN for server/edge/backend.
- `tracesSampleRate` defaulted to 0.1 (10%) — production-safe; raise to 1.0 only for performance debugging.
- `sendDefaultPii: false` everywhere (GDPR-safer baseline).
- `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0.5` for sellercentral — session replay only on errors, with `maskAllText: true` + `blockAllMedia: true` (GDPR-safe).
- `beforeSend` filters out `EPIPE` (client disconnect) and `Invalid source map` noise.

Acceptance — verified by `/tmp/andertal-sentry-test.js` (deleted after run), 14/14 pass:
- [x] `@sentry/node` loads and `init()` does not throw on fake DSN.
- [x] `Sentry.setupExpressErrorHandler` and `captureException` exist on `@sentry/node` v10.
- [x] `@sentry/nextjs` loads; `withSentryConfig` and `captureRequestError` exported.
- [x] `server.js` contains `Sentry.init` block and `setupExpressErrorHandler(httpApp)` wired BEFORE `httpApp.listen`.
- [x] Sellercentral has all 4 Sentry config files.
- [x] Sellercentral `next.config.js` wraps with `withSentryConfig(withNextIntl(...))`.
- [x] `node --check apps/medusa-backend/server.js` clean.
- [x] `npm run lint --workspace=apps/sellercentral` clean.

Risk realized: Low.

### AGENT NOTES (S1.4)

- Branch: continued on `fix/s1-1-rotate-secrets`.
- Files changed:
  - `apps/sellercentral/package.json` — added `@sentry/nextjs: ^10.35.0`
  - `apps/medusa-backend/package.json` — added `@sentry/node: ^10.35.0`
  - `package-lock.json` — auto-updated by npm
  - `apps/sellercentral/sentry.server.config.js` (new)
  - `apps/sellercentral/sentry.edge.config.js` (new)
  - `apps/sellercentral/instrumentation.js` (new)
  - `apps/sellercentral/instrumentation-client.js` (new)
  - `apps/sellercentral/next.config.js` — added `withSentryConfig` wrap
  - `apps/sellercentral/.env.example` — added Sentry section
  - `apps/medusa-backend/server.js` — Sentry init at top + error handler before listen()
  - `apps/medusa-backend/.env.example` — expanded Sentry section with instructions
- USER ACTION REQUIRED (to actually start receiving events):
  1. Create two Sentry projects: one Next.js (for sellercentral), one Node.js (for backend).
  2. Set on sellercentral Vercel: `NEXT_PUBLIC_SENTRY_DSN`, optionally `SENTRY_AUTH_TOKEN` for source-map upload in CI.
  3. Set on backend Render: `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SENTRY_TRACES_SAMPLE_RATE=0.1`.
  4. Trigger a test error in each environment and verify it lands in Sentry.

### S1.4b (NEW follow-up) — Migrate shop hardcoded DSN to env [ ]

`apps/shop/sentry.server.config.js`, `sentry.edge.config.js`, and `instrumentation-client.js` still have the DSN hardcoded. For consistency and per least-surprise, switch these to read `NEXT_PUBLIC_SENTRY_DSN` (with the hardcoded value retained as a temporary fallback during transition). Small, isolated change. Low priority but useful for hygiene.

---

### S1.5 — Move hardcoded LAN IPs out of production code [x]

Problem: `apps/shop/next.config.js:33` had a hardcoded `http://192.168.1.240:3000` in `allowedDevOrigins`. `apps/sellercentral/next.config.js:55` had hardcoded `http://localhost:9000 http://192.168.2.127:9000` baked into the production CSP `connect-src`. Both ship to production.

Subtasks:
- [x] Shop: removed the hardcoded `192.168.1.240:3000` line. The existing `SHOP_ALLOWED_DEV_ORIGINS` env (already wired) is now the only way to add LAN IPs. Loopback (`localhost:3000`, `127.0.0.1:3000`) remains as default for local dev convenience.
- [x] Sellercentral: introduced new env `SC_ALLOWED_DEV_BACKEND_HOSTS` (comma-separated, default `http://localhost:9000`). Gate behind `NODE_ENV !== 'production'` — in production the CSP `connect-src` becomes pure `'self' https: wss:`, so no LAN IP can leak there even if the env is set by accident.
- [x] Documented `SC_ALLOWED_DEV_BACKEND_HOSTS` in `apps/sellercentral/.env.example` with example and explicit "production ignores this list" warning.
- [x] Removed the only remaining LAN-IP-looking string from a code comment (`192.168.2.127` → `192.168.x.x` placeholder).

Acceptance — verified by `/tmp/andertal-csp-test.js` (deleted after run), 11/11 pass:
- [x] No `192.168.x.x` IP in shop next.config.js source.
- [x] No `192.168.x.x` IP in sellercentral next.config.js source (placeholder text only).
- [x] Production CSP excludes LAN IPs even when `SC_ALLOWED_DEV_BACKEND_HOSTS` env is set — `connect-src 'self' https: wss:`.
- [x] Dev CSP defaults to `http://localhost:9000` when env unset.
- [x] Dev CSP includes user-provided LAN IPs when env is set.
- [x] `npm run lint --workspace=apps/sellercentral` clean.
- [x] `npm run lint --workspace=apps/shop` clean.
- [x] `node --check apps/shop/next.config.js` and `node --check apps/sellercentral/next.config.js` clean.

Risk realized: Zero in production. In dev, users who relied on the old LAN IPs need to add them to env (one-line change in `.env.local`).

### AGENT NOTES (S1.5)

- Branch: continued on `fix/s1-1-rotate-secrets`.
- Files changed:
  - `apps/shop/next.config.js` — removed line `"http://192.168.1.240:3000",` from allowedDevOrigins. Added a 4-line comment explaining how to extend via env.
  - `apps/sellercentral/next.config.js` — added `isProduction` + `devBackendHosts` computation near top; CSP `connect-src` now uses `devBackendHosts.join(" ")`.
  - `apps/sellercentral/.env.example` — new section documenting `SC_ALLOWED_DEV_BACKEND_HOSTS` with production-safety note.
- Verification: 11/11 test scenarios + 2 lint runs + 2 syntax checks all green.
- USER ACTION: After deploy, no action required for production (LAN IPs already excluded). For local dev with cross-device testing, set in each app's `.env.local`:
  - shop: `SHOP_ALLOWED_DEV_ORIGINS=http://<your-lan-ip>:3000`
  - sellercentral: `SC_ALLOWED_DEV_BACKEND_HOSTS=http://localhost:9000,http://<your-lan-ip>:9000`

---

### S1.6 — Strengthen CI: typecheck, test, audit jobs [ ]

Problem: `.github/workflows/ci.yml` only runs lint and build. No type-check, no tests, no security audit, no e2e.

Subtasks:
- [ ] Add `typecheck` job: `tsc --noEmit` in each app.
- [ ] Add `test` job: run existing `node --test` scripts in medusa-backend; run `npm test` in apps if defined.
- [ ] Add `audit` job: `npm audit --audit-level=high` non-blocking warning.
- [ ] Add `e2e` job (Playwright) for shop login + add-to-cart + checkout smoke; allow failure for now (mark `continue-on-error: true`).
- [ ] Caching: ensure `actions/setup-node@v5` cache is effective.

Acceptance:
- A PR with a TypeScript error fails CI.
- A PR with high-severity npm audit issue produces warning.

Risk: Low. May surface existing TS errors that need fixing — log them as new tasks.

---

### S1.7 — Logger usage in src/ files (excluding server.js for now) [ ]

Problem: `apps/medusa-backend/src/logger.js` exists with pino but is not imported anywhere. All logging in src/ uses `console.log`.

Subtasks:
- [ ] In each file under `apps/medusa-backend/src/` (except logger.js itself and `*.test.js`): replace `console.log` with `logger.info`, `console.warn` with `logger.warn`, `console.error` with `logger.error`.
- [ ] Add `const logger = require('./logger')` import at top of each file (relative path may vary).
- [ ] Do not touch `server.js` — that is S2.5 (separate task because of size).

Acceptance:
- No `console.*` calls in `apps/medusa-backend/src/*.js` files (besides server.js, logger.js, *.test.js).

Risk: Low.

---

## SPRINT 2 — REFACTOR AND CLEANUP (2-3 weeks)

### S2.1 — Duplicate route cleanup in shop [ ]

Problem: shop has parallel routes for products (`/product/[slug]`, `/produkt/[handle]`, `/[handle]`) and collections (`/collections/[slug]`, `/kollektion/[handle]`). Root cause of TALIMAT.md item about `/produkt/vampirevape...` URL structure.

Subtasks:
- [ ] Decide canonical: probably `/[handle]` for product (Shopify-like, locale-aware via [locale] segment).
- [ ] All other product routes become 301 redirects to canonical.
- [ ] Same exercise for collections.
- [ ] Update internal links in components.

Acceptance:
- Visiting `/de/de/produkt/foo` returns 301 to `/de/de/foo`.
- All product pages render under canonical URL.
- No duplicate content in sitemap.

Risk: Medium — SEO impact. 301 redirects preserve link equity, but Google needs a few weeks to consolidate.

DECISION NEEDED: Which URL is canonical?
- Option A: `/[locale]/[handle]` — Shopify style, no prefix, simplest
- Option B: `/[locale]/produkt/[handle]` (DE) or `/product/[slug]` (EN) — language-aware path
- Default if no user input: Option A.

---

### S2.2 — Extract schema from server.js into migrations [ ]

Problem: 65 `CREATE TABLE IF NOT EXISTS` statements in server.js are the de-facto schema source. Migrations folder has only 9 unrelated migrations. No source of truth.

Subtasks (kademeli — chunk by domain):
- [ ] Inventory the 65 tables: list table name, source line, columns.
- [ ] Group by domain (sellers, orders, products, integrations, etc).
- [ ] Phase 2.2.a: write proper migrations for domain 1 (say, sellers + auth).
- [ ] Phase 2.2.b: remove the corresponding CREATE TABLE blocks from server.js after migration runs in test env.
- [ ] Repeat for remaining domains.

Acceptance:
- After fresh `npm run db:migrate` against empty DB: all tables present.
- server.js no longer contains CREATE TABLE statements.

Risk: High. Requires careful test DB validation. NEVER run on prod without DBA-style review.

---

### S2.3 — server.js refactor: split by domain [ ]

Problem: 24,280 lines in one file. Unmaintainable.

Subtasks (kademeli):
- [ ] Create `apps/medusa-backend/src/routes/` directory.
- [ ] Identify route domains (sellers, orders, products, integrations, billbee, flows, media, etc).
- [ ] Phase 2.3.a: extract route domain 1 to `src/routes/<domain>.js`, mount in server.js.
- [ ] Repeat for remaining domains.

Acceptance:
- server.js becomes a thin bootstrap + route mounting file (< 500 lines target).
- All domain logic in separate files.

Risk: High. Hidden coupling between routes is likely. Each domain extraction is its own PR with regression testing.

---

### S2.4 — i18n consolidation [ ]

Problem: 54 separate `*-i18n.js` files in `apps/sellercentral/src/lib/` duplicating what `messages/{locale}.json` could hold. Hardcoded fallbacks cause partial-localization bugs (e.g. TALIMAT item about verification page only DE/EN).

Subtasks:
- [ ] Audit each `lib/*-i18n.js`: identify strings, move to appropriate `messages/{locale}.json`.
- [ ] Update consumers to use `useTranslations` (next-intl) instead.
- [ ] Delete the lib file once empty.

Acceptance:
- Less than 10 `*-i18n.js` files remain in lib/ (only those with non-trivial logic, not just string maps).

Risk: Medium. Many touch-points; do it incrementally.

---

### S2.5 — Logger usage in server.js [ ]

Problem: 206 `console.*` calls in server.js. After S1.7 is done, do the same for server.js.

Subtasks:
- [ ] Replace `console.log` / `console.warn` / `console.error` with `logger.*`.
- [ ] Use child loggers for request context if feasible.

Risk: Low. Big diff but mechanical.

---

### S2.6 — Test infrastructure setup [ ]

Problem: ~3 test files for the entire codebase.

Subtasks:
- [ ] Pick test runner per app (vitest for shop and sellercentral; node:test for backend already in use).
- [ ] Add at least one test file with one passing test per app to wire CI.
- [ ] Add backend integration test for auth flow (login -> verify token -> protected endpoint).
- [ ] Add e2e test for shop checkout (extend existing `shop.spec.js`).

---

### S2.7 — DECISION: keep Medusa or drop it [!]

Problem: package.json says "mock backend, NOT production-ready, Real Medusa v2 integration pending" but `@medusajs/*` packages are installed and `medusa-config.js` exists. The actual backend is a custom Express monolith in server.js.

BLOCKING (S2.7):
- Decision needed: A) commit to migrating to Medusa v2 properly (months of work, official Medusa modules), or B) formally drop Medusa (remove deps, rename apps, accept the custom backend as the official backend).
- Default suggestion: Option B. The custom backend already has too much business logic that does not fit Medusa's module model. Keeping Medusa deps adds ~200 MB to node_modules and confuses readers. Make the custom backend the official thing.
- Need user input before any further action on this task.

---

## SPRINT 3 — TALIMAT.MD BUG FIXES

Each item references the corresponding paragraph in `docs/TALIMAT.md`. Order is not strict — pick by impact.

- [ ] S3.1 — Excel import: seller_id binding fix; EAN conflict should not error; submit change-suggestion to superuser if data differs (TALIMAT lines 3, 12)
- [ ] S3.2 — Marketing campaigns: multi-platform budget split with single click publish (TALIMAT line 6)
- [ ] S3.3 — Multi-seller buy box algorithm; show all sellers under product, not just latest (TALIMAT lines 8, 32)
- [ ] S3.4 — Excel: add `per_unit` column next to unit_type/unit_value (TALIMAT line 10)
- [ ] S3.5 — 2nd seller adding existing EAN: status=draft, empty fields per the spec; save bug fix (TALIMAT line 32)
- [ ] S3.6 — Tracking number triggers carrier polling, syncs lieferstatus (TALIMAT lines 18, 53, 57)
- [ ] S3.7 — Product breadcrumbs: actual category, not "Koleksiyon" (TALIMAT line 21-27)
- [ ] S3.8 — Coupon validation in checkout: superuser vs seller coupon categorization (TALIMAT line 30)
- [ ] S3.9 — Bestseller badge in product cards everywhere (TALIMAT line 34)
- [ ] S3.10 — QR sign endpoint with signature pad + long legal docs in all locales (TALIMAT line 37)
- [ ] S3.11 — Bestseller carousel container template for landing pages (TALIMAT line 39, 41)
- [ ] S3.12 — Brands page missing latest brand (TALIMAT line 43)
- [ ] S3.13 — Shop URL canonicalization (TALIMAT line 45) — depends on S2.1
- [ ] S3.14 — Geolocation-based locale routing (TALIMAT line 47)
- [ ] S3.15 — Add to cart broken when side cart opens (TALIMAT line 49)
- [ ] S3.16 — Order confirmation page restored (TALIMAT line 51)
- [ ] S3.17 — Order status: only zugestellt -> abgeschlossen, not versendet (TALIMAT line 55)

---

## SPRINT 4 — STRATEGIC PLATFORMS

DO NOT START UNTIL SPRINT 1 IS DONE. Strongly recommend SPRINT 2.1, 2.2 (at least the seller/auth domain), 2.6 also done.

### S4.1 — Developer Platform (apps/developer/) [ ]
Full spec in `docs/developer.md`. Follow PR phases listed there (PR 1 through PR 10).

Pre-checks before starting:
- [ ] SPRINT 1 fully `[x]`.
- [ ] Seller and auth tables exist as proper migrations (S2.2 partial).
- [ ] Logger and Sentry working in backend.

### S4.2 — Affiliate Platform (apps/affiliate/) [ ]
Full spec in `docs/affiliate.md`. Follow PR phases listed there (PR 1 through PR 10).

Same pre-checks as S4.1. Additionally:
- [ ] Stripe Connect setup decision made (developer platform PR 9 ships Stripe Connect shared package; affiliate reuses it).

---

## DECISION CHANGES (log every time a doc decision is updated by agent)

(empty)

---

## CHANGE LOG (every session appends a short entry)

- 2026-06-23 Agent-1 (Murathan main PC): Created ACIL.md from prior audit findings. Completed S1.1 on branch `fix/s1-1-rotate-secrets`. Three test scenarios validated (dev OK, prod-no-env fails, prod-with-env OK). Branch ready for user review/push/merge.
- 2026-06-23 Agent-1 (Murathan main PC): Completed S1.2 on same branch. Added `jose@^5` to sellercentral and rewrote middleware to verify HS256 JWT signature + expiry. 7/7 token-roundtrip tests passed including `alg=none` confusion attack rejection. Branch not yet pushed.
- 2026-06-23 Agent-1 (Murathan main PC): Completed S1.3 on same branch. Inserted /admin-hub gatekeeper at server.js:1746. 14/14 integration tests passed including prefix-smuggling attack rejection. Spawned follow-up task S1.3b (clean up redundant explicit auth + handle /admin/*).
- 2026-06-24 Agent-1 (Murathan main PC): Completed S1.4 on same branch. Added Sentry to backend (`@sentry/node`) and sellercentral (`@sentry/nextjs`). All env-driven, no-op when DSN unset. 14/14 sanity tests passed. Branch still not pushed.
- 2026-06-24 Agent-1 (Murathan main PC): Completed S1.5 on same branch. Removed hardcoded LAN IP `192.168.1.240` from shop next.config.js and `192.168.2.127` from sellercentral CSP. Added `SC_ALLOWED_DEV_BACKEND_HOSTS` env (dev-only, production-gated). 11/11 CSP integrity tests passed. Branch still not pushed.
- 2026-06-24 Agent-1 (Murathan main PC): Handover audit. Verified all S1.1-S1.5 code is in place via spot-check (readSecretOrFail, jwtVerify, ADMIN_HUB_PUBLIC_PATTERNS, setupExpressErrorHandler, devBackendHosts). Found and fixed two leftover LAN IP literals in `.env.example` example comments (`apps/sellercentral/.env.example`, `apps/shop/.env.example` — both changed `192.168.2.127` to `192.168.x.x` placeholder). Added ONBOARDING and COMMIT MAP sections to top of this file so a fresh agent on a different PC can self-bootstrap.
