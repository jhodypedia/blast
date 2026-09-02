# Project Memory — WhatsApp Blast SaaS

Last updated: 2026-09-02

## Purpose

Running record of what exists, what is verified, what is not, and what to do
next. Read this together with `RULES.md` and `AGENTS.md` before starting work.

## Current State

The application is feature-complete for the ADMIN and USER surfaces described in
`RULES.md`. Lint, typecheck, unit tests and a production build pass, and the
delivery invariants now also pass as **integration tests against a live
MariaDB 11.4** (portable instance on port 3307), so `FOR UPDATE SKIP LOCKED`
claiming, lease recovery and ledger idempotency are verified by execution rather
than by types. Redis is available locally as a portable instance on 6379. The
app has also been **booted with the real `.env` and probed over HTTP** end to
end (see "Live HTTP probe" below). The WhatsApp adapter is still unexercised
against a real device.

### Verification (last full run)

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` (`eslint`) | exit 0 |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | exit 0 |
| Unit tests | `npm test` (`vitest run`) | exit 0 — 174 tests, 16 files |
| Integration tests | `npm run test:integration` | exit 0 — 12 tests, 1 file, live MariaDB 11.4 on 3307 |
| Build | `npm run build` | exit 0 — 22 routes, no `[ioredis] Unhandled error event` |

### Live HTTP probe

`next dev` was started against the real `.env` (XAMPP MariaDB 10.4 on 3306 +
portable Redis on 6379) and driven with a throwaway Node script over
`http://127.0.0.1:3000`. **41 assertions, 0 failures** after the fix below.
What it covered:

- `/`, `/login`, `/register` as an anonymous visitor.
- `/api/health`: public response is `{"status":"ok"}` with `no-store` and no
  dependency detail; a valid `HEALTH_CHECK_TOKEN` bearer adds
  `checks.database` / `checks.redis` (both `true`); a **wrong** token silently
  falls back to the public answer rather than erroring.
- Auth.js `providers` (credentials only), `csrf`, `session` (`null` when
  anonymous).
- Anonymous `/admin`, `/admin/settings`, `/dashboard`, `/dashboard/wallet` all
  302 to `/login?callbackUrl=…`.
- Wrong password yields `?error=CredentialsSignin` and no session; correct admin
  credentials sign in.
- Session claims expose `role`, `status` and no `passwordHash`.
- Every admin page returns 200 with an ADMIN session.
- ADMIN hitting any `/dashboard/*` route 307s to `/admin` (no 5xx).
- A signed-in ADMIN is bounced off `/login` and `/register` to `/admin`.
- Sign-out clears the session cookie.

The probe deliberately only scans **200** bodies for error markers; scanning 3xx
bodies produced false failures.

### Local infrastructure (must be started each session)

Both are hidden processes, not Windows services, so they do **not** survive a
reboot or logout. The binaries live under `.tools/` (gitignored); the launcher
scripts were scratch `_*` files and have been deleted, so the commands are
recorded here instead.

Redis 8.10.1 → `redis://127.0.0.1:6379`:

```powershell
$d = 'C:\Users\admin\Desktop\project\wablast\.tools'
Start-Process -WindowStyle Hidden `
  -FilePath "$d\redis8\Redis-8.10.1-Windows-x64-msys2\redis-server.exe" `
  -ArgumentList '--port','6379','--bind','127.0.0.1','--protected-mode','yes','--dir',"$d\redis-data"
```

MariaDB 11.4.9 (portable, own datadir) → port **3307**:

```powershell
$d = 'C:\Users\admin\Desktop\project\wablast\.tools'
Start-Process -WindowStyle Hidden `
  -FilePath "$d\mariadb\mariadb-11.4.9-winx64\bin\mysqld.exe" `
  -ArgumentList "--datadir=$d\mariadb-data",'--port=3307','--bind-address=127.0.0.1','--skip-name-resolve','--console'
```

Only ever stop a `mysqld` whose `Path` is that exact binary — the XAMPP instance
on 3306 must be left alone. Confirm readiness by executing
`SELECT 1 FROM DUAL FOR UPDATE SKIP LOCKED;` rather than by parsing `VERSION()`.

## Architecture

```
src/
  app/            App Router routes; pages are thin and call queries/services
    actions/      "use server" entry points: auth, devices, blast, wallet,
                  admin-campaigns, admin-targets, admin-money, admin-jobs, and
                  admin-users (which also holds `updateSettingAction`)
    admin/        ADMIN pages (overview, campaigns, target-lists, jobs, users,
                  withdrawals, settings, audit)
    dashboard/    USER pages (overview, devices, campaigns, jobs, wallet, profile)
    api/          auth handler + /api/health
  components/     ui/ (shadcn), layout/, admin/, devices/, blast/, wallet/,
                  auth/, security/
  lib/            domain logic, one folder per concern
  worker/         BullMQ processes: delivery, device-session, target-import,
                  maintenance
```

Layering rule in force: components never touch Prisma; actions and route handlers
validate + delegate; all business rules live in `lib/*/service.ts`; every
WhatsApp call goes through `lib/whatsapp/adapter.ts`.

Read-only page data comes from dedicated `queries.ts` modules
(`lib/admin/queries.ts`, `lib/admin/job-queries.ts`, `lib/blast/queries.ts`,
`lib/wallet/queries.ts`) so pages never import a mutating service.

## Key Decisions

- **Redis is treated as optional infrastructure.** `lib/redis/client.ts` attaches
  an `error` listener to every connection (an unhandled ioredis `error` event can
  kill the process), uses `lazyConnect: true` so importing a module never opens a
  socket, and caps reconnection with `connectTimeout: 5s` +
  `retryStrategy: min(attempt * 200ms, 5s)`. A circuit breaker
  (`lib/redis/circuit.ts`, 3 consecutive failures → open for 10s, then one probe)
  stops callers from paying the connect timeout on every request while Redis is
  down.
  - Cache-like callers use `withRedis(op, fallback)` and degrade silently:
    `lib/settings/service.ts` falls back to the database then the registry
    default, and `/api/health` reports `redis: false` / `degraded` instead of
    throwing.
  - `lib/security/rate-limit.ts` deliberately **fails closed**: when the breaker
    is open or the pipeline throws, `consumeRateLimit` denies the request, so
    taking Redis down cannot disable rate limiting. Only `resetRateLimit` and the
    window-TTL repair are best-effort.
  - Queue connections are separate (`createQueueConnection`) and keep
    `maxRetriesPerRequest: null` (required by BullMQ) and eager connect; they do
    not use the breaker, because a dropped enqueue must fail loudly.
- **Withdrawal state machine** lives in `lib/withdrawal/transitions.ts` with no
  DB imports, so it is unit-testable and reusable by the admin UI. The service
  imports it rather than duplicating the rules.
- **Settings** are a typed registry (`lib/settings/registry.ts`): every key has a
  Zod schema and a default, and `getSetting` falls back to the default when the
  row is missing, so the app boots against an unseeded database. Keys are only
  referenced through `SETTING_KEYS`, never as raw strings.
- **`/register` is `force-dynamic`.** It reads `auth.registration_enabled`, which
  made `next build` attempt a settings read (and a Redis connection) at prerender
  time.
- **`lib/env.ts` treats an empty variable as absent** so `KEY=""` in a `.env`
  template falls through to the optional branch instead of failing `min(1)`.
- **Campaign economics freeze** after the first recipient row exists: payout,
  quota and target list can no longer be edited, only status transitions.
- **Blast jobs snapshot policy** (`snapshotAllowUserPause`, allowed speeds,
  payout) at creation, so an admin edit cannot retroactively change a job in
  flight.
- **Large form files were split** to stay under the editor write limit:
  `campaign-form.tsx` / `campaign-form-shared.tsx` / `campaign-delivery-fields.tsx`.
  Shared `Field`, `SPEED_OPTIONS` and form types live in the `-shared` file.
- **MariaDB 10.6 / MySQL 8.0 is a hard floor**, not a preference.
  `claimRecipients` and the start-job allocation depend on
  `FOR UPDATE SKIP LOCKED`, which MariaDB 10.4 (what XAMPP ships) parses as a
  syntax error (SQL 1064). There is no safe fallback: without SKIP LOCKED,
  parallel workers either block on each other or take overlapping batches, and an
  overlapping batch means a double send. Hence the portable MariaDB 11.4 instance
  on 3307 rather than reusing XAMPP.
- **Database capability is detected by behaviour, not by version string.**
  `tests/integration/db-capabilities.ts` runs `SELECT 1 ... FOR UPDATE SKIP
  LOCKED` inside a throwaway transaction and caches the outcome; forks and distro
  builds misreport `VERSION()`, so parsing it would be wrong on exactly the
  machines where it matters. `beforeAll` throws an actionable message when the
  probe fails, instead of leaving five tests to fail with raw SQL 1064.
- **Integration tests are excluded from `npm test`** by the `include` pattern in
  `vitest.config.mts`, and live in `vitest.integration.config.mts` with
  `maxWorkers: 1` + `fileParallelism: false`. Files must run sequentially because
  they share fixture rows; the concurrency actually under test is created *inside*
  a test with `Promise.all`, not by the runner.
- **Integration fixtures clean up by id prefix (`itest-`), never `TRUNCATE`.** A
  misconfigured `DATABASE_URL` can then only fail to find rows, not destroy a real
  database. `scripts/prepare-test-db.ts` reinforces this: it refuses any database
  name not matching `/test/i` and validates the identifier charset before
  interpolating it into `CREATE DATABASE`.
- **The Prisma CLI is invoked as
  `spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...])`** in
  `scripts/prepare-test-db.ts`. `npx` on Windows needs `.cmd` resolution plus a
  shell, which brings quoting risk; calling the entrypoint with the current Node
  binary avoids both. On this machine `npm.ps1`/`npx.ps1` are additionally blocked
  by the execution policy, so `npm.cmd` is the only working shim from PowerShell.
- **The initial migration was baselined, not re-created.** The dev database
  already had the schema, so `migrate deploy` failed with P3005; the fix was
  `prisma migrate resolve --applied 20260901000000_init` after confirming
  `migrate diff --from-migrations --to-config-datasource` reported no difference.
  Never `prisma db push` here.
- **`Button` marks its `asChild` child with `Slottable`.** The button always
  renders the loading spinner as a *sibling* of `children`, so Radix `Slot` saw
  two children and threw `Slot failed to slot onto its children`. This was a real
  500 on `/admin/campaigns` (the only page using `<Button asChild>` inside a
  server component) and was found by the live HTTP probe, not by types — the
  failure is a runtime invariant of `Slot`, so nothing in `tsc` or the unit suite
  could have caught it. `src/components/ui/button.test.tsx` now covers it with
  `renderToStaticMarkup`.
- **`src/proxy.test.ts` casts through `unknown`.** `auth()` is typed as an
  `AppRouteHandlerFn` (two parameters), while the `next-auth` stub returns the
  bare one-parameter decision function, so a direct cast is not assignable under
  `strict`.

## Delivery Integrity

- `claimRecipients` uses `SELECT ... FOR UPDATE SKIP LOCKED` in a short
  `ReadCommitted` transaction, then closes it before any provider call.
- Recipient states: PENDING → CLAIMED → SENDING → SENT / RETRYABLE_FAILED /
  FAILED / CANCELLED / SKIPPED / UNKNOWN / RECONCILIATION_REQUIRED.
- `markSending` is the pre-send gate: it fails when the lease was lost, and the
  caller must abort without sending.
- `reclaimExpiredClaims` only recovers rows stuck in `CLAIMED`. A row in
  `SENDING` is never auto-released or retried; it goes to reconciliation, because
  the message may already have been delivered.
- Earnings are credited only on confirmed `SENT`, through `appendLedgerEntry`
  with a unique idempotency key, so a replayed job cannot pay twice.

## Money

All amounts are `Decimal` in Prisma and `decimal.js` in application code; no
float arithmetic anywhere. Withdrawal request creates a negative
`WITHDRAWAL_HOLD` entry in the same serializable transaction that creates the
row. Reject and cancel append a compensating `WITHDRAWAL_RELEASE`; the ledger is
never mutated or deleted.

## Known Gaps

1. **Integration coverage is delivery-only.** `tests/integration/delivery-invariants.integration.test.ts`
   covers concurrent claiming, `markSending` ownership, lease expiry and crash
   recovery, clean-stop release, earning idempotency (replay and concurrent) and
   the failure/ambiguity paths — 12 tests, all green against MariaDB 11.4. Auth,
   device limits, target import, campaign assignment, wallet and withdrawal still
   have no integration tests. No E2E tests exist at all.
2. **WhatsApp adapter unexercised.** Pairing, QR, reconnect and send have not run
   against a real device.
3. **Turnstile** falls back to a hidden `development-placeholder` token in the
   widget when no site key is configured. `verifyTurnstileToken` throws
   `CAPTCHA_FAILED` whenever the secret is missing and `NODE_ENV === "production"`,
   and skips only outside production, so a misconfigured production deploy fails
   closed rather than losing protection. The real widget has not been exercised
   end to end.
4. **The dev database on XAMPP (3306) cannot execute claims.** It is MariaDB 10.4,
   which has no `FOR UPDATE SKIP LOCKED`. Anything that starts a blast job or
   claims recipients will fail there with SQL 1064. Either point `DATABASE_URL` at
   the portable 11.4 instance on 3307 and run `prisma migrate deploy` against the
   `blast` database there, or accept that only non-delivery flows work in dev. Not
   yet decided.
5. **Portable Redis and MariaDB are not services.** Both must be relaunched after
   every reboot or logout (commands under "Local infrastructure"); a stale
   assumption here shows up as connection-refused rather than as a clear error.
6. **No automated coverage of the HTTP surface.** The probe described above was a
   throwaway script and has been deleted. Nothing in `npm run verify` would catch
   a page that 500s at runtime; only `src/components/ui/button.test.tsx` guards
   the specific `Slot` regression that caused one. A real E2E harness is still
   missing.

## Next Task

1. Resolve gap 4: decide whether dev moves to port 3307, and apply the migration
   there if so.
2. Exercise `npm run worker` against a real device for one small seeded campaign,
   end to end, and record what the WhatsApp adapter actually does on pair,
   reconnect and send.
3. Extend integration coverage outward from delivery: device limits, target
   import, then withdrawal hold/release.
4. Add a checked-in smoke test for the HTTP surface (gap 6) so route-level 500s
   are caught by `npm run verify` instead of by hand.
5. Re-run `npm run verify` plus `npm run test:integration` after each of the
   above.


