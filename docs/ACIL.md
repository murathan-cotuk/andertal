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

## STATUS SNAPSHOT (every agent updates this at end of session)

- Last update: 2026-06-23 by Agent-1 (Cursor on Murathan's main PC)
- Active task: none (S1.1 + S1.2 finished, awaiting "continue?" decision)
- Blocking decisions: none yet
- Active branch: `fix/s1-1-rotate-secrets` (per user request, multiple sprint-1 tasks share one branch to keep PR count low)
- Pushed to remote: NO (awaiting user push approval)
- Next pending tasks (any order): S1.3 admin-route auth, S1.4 Sentry, S1.5 LAN IPs, S1.6 CI, S1.7 logger
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

### S1.3 — Add auth middleware to admin-hub and admin routes [ ]

Problem: `apps/medusa-backend/src/api/admin-hub/v1/categories/route.ts` (and siblings) have no auth check. Any unauthenticated request can create/update/delete categories, brands, banners.

Subtasks:
- [ ] Identify existing auth helper in `server.js` (likely a function used elsewhere; do not duplicate).
- [ ] Wrap GET/POST/PUT/DELETE handlers in admin-hub routes with auth check.
- [ ] Return 401 if no auth, 403 if not superuser/admin role.
- [ ] Verify in /admin routes too.

Acceptance:
- Unauthenticated `curl -X POST /admin-hub/v1/categories` returns 401.

Risk: Medium. Could break sellercentral if frontend was relying on unauthenticated access (which would itself be a bug).

---

### S1.4 — Add Sentry to sellercentral and backend [ ]

Problem: Sentry is only configured for the shop app. Sellercentral and backend errors are not captured.

Subtasks:
- [ ] Sellercentral: add `@sentry/nextjs`, wrap `next.config.js` with `withSentryConfig`, add `sentry.client.config.js` and `sentry.server.config.js`.
- [ ] Backend: add `@sentry/node`, init at top of `server.js`, wrap express error handler.
- [ ] Set `SENTRY_DSN` env vars in `.env.example` (do not commit real DSNs).
- [ ] Verify a deliberate test error appears in Sentry dashboard (manual user step).

Acceptance:
- Throwing an error in any sellercentral page or backend route shows up in Sentry within 60 seconds.

Risk: Low.

---

### S1.5 — Move hardcoded LAN IPs out of production code [ ]

Problem: `apps/shop/next.config.js:33` has `http://192.168.1.240:3000`. `apps/sellercentral/next.config.js:55` has `http://192.168.2.127:9000` in CSP. These should not ship to production.

Subtasks:
- [ ] In both next.config.js files, gate dev-only origins by `process.env.NODE_ENV !== 'production'`.
- [ ] Move dev IPs into `SHOP_ALLOWED_DEV_ORIGINS` env (pattern already exists in shop, extend to sellercentral).
- [ ] Document in `.env.example`.

Acceptance:
- Production build CSP does not contain any 192.168 or 10.x IPs.

Risk: Low.

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
