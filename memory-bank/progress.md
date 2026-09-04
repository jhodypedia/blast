# Project Memory — WhatsApp Blast SaaS

Last updated: 2026-09-03

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

Re-run after the dark-green frontend redesign and the `motion.tsx` rewrite
(2026-09-02): lint exit 0, `tsc --noEmit` exit 0, `vitest run` **178/178 in 17
files** (the new file is `src/components/ui/motion.test.tsx`), `npm run build`
exit 0 with the same 22 routes. Integration tests were **not** re-run for either
change (no schema, query or service file was touched).

Two build-tooling notes for this machine, both cost time:

- `npm.ps1` is blocked by the PowerShell execution policy, so every command must
  go through `cmd /c "npm …"`. Terminal capture is also unreliable here; redirect
  to a log file and read the file instead of trusting the captured output.
- **Never run two `next build`s concurrently.** Doing so corrupted
  `.next/dev/types/routes.d.ts` mid-write and produced a misleading
  `Failed to type check` with `TS1434`/`TS1109`/`TS1160` inside that generated
  file. The source was fine; a single clean rebuild passed. Treat syntax errors
  reported *inside `.next/`* as a stale-artifact symptom, not a code defect.

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

## Frontend Design System (dark-green premium theme)

The whole UI layer was rebuilt on a single flat dark-green design system. No
backend, API, Prisma, action, service, queue or auth file was touched by that
work: every change is in `src/app/**/page.tsx` / `layout.tsx`,
`src/app/globals.css` and `src/components/**`. Pages kept their existing data
loading and their existing server actions; only presentation changed.

Tokens (`src/app/globals.css`, `@theme inline`):

- Everything is defined in `oklch` on a green hue (~160–166) so contrast is
  predictable: `--background` 0.152 → `--surface` 0.185 → `--surface-strong`
  0.222, text `--foreground` 0.975 and `--muted-foreground` 0.755.
- `--primary` / `--ring` are emerald (0.735–0.79 L). Semantic tones are
  `--success` (emerald), `--warning` (amber), `--destructive` (rose) and
  `--info` (cyan/teal); each has a matching `-foreground`.
- **Flat colour only.** There are no `linear-gradient`/`radial-gradient`
  backgrounds anywhere in the theme; depth comes from surface steps, solid
  borders (`--border`, `--border-strong`) and shadows.
- `--radius` 0.875rem with `sm/md/lg/xl/2xl` derived from it, so radii stay
  consistent without per-component magic numbers.
- Dark mode only, declared with `color-scheme: dark`; there is no light palette
  to keep in sync.

Primitives in `src/components/ui/`:

- `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `form.tsx`, `badge.tsx`,
  `table.tsx`, `dialog.tsx`, `progress.tsx`, `skeleton.tsx`.
- `motion.tsx` holds the shared animation vocabulary (`Reveal`, `Stagger`,
  `StaggerItem`, `PageTransition`, `AmbientBackground`) so no page hand-rolls
  Framer Motion variants.
- `page.tsx` holds page composition (`PageHeader`, `PageSections`, `StatGrid`,
  `StatCard`, `SectionCard`, `EmptyState`, `DetailRow`, `Notice`) plus
  `IconTile`/`IconTileTone` from `card.tsx` for the coloured icon chips. Every
  dashboard and admin screen is assembled from these, which is why the pages are
  short and visually identical in rhythm.
- Animations are restricted to `transform`/`opacity`, and `prefers-reduced-motion`
  is honoured, so scroll reveals and hover lifts do not thrash layout.

Consequences worth remembering:

- `page.tsx` primitives are **presentational only** — they receive already
  formatted, already role-filtered values. Do not let them fetch or format.
  Nothing in them can render a raw target number because no target number is
  passed in.
- Icons are Lucide, sized with the `size-*` utilities (20–24px in UI, larger in
  tiles) and always paired with text in buttons and navigation.
- Adding a page means composing `PageHeader` + `PageSections` + `SectionCard`;
  introducing new colours or new one-off shadows is a regression, not a feature.

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
- **Reduced motion is handled by `MotionConfig reducedMotion="user"`, never by
  branching on `useReducedMotion()`.** The first version of `motion.tsx` did the
  latter: on `reduce` it returned a plain `<div>` instead of a `motion.div`. Three
  problems, none of which `tsc`, `eslint` or `next build` reported — all four
  primitives type-checked, linted and rendered.
  1. **Hydration mismatch.** `useReducedMotion()` is `null` during SSR and can be
     `true` on the client's first render, so the server emitted `motion.div` and
     the client expected `div`. `MotionConfig` only writes context, so both sides
     now emit identical markup.
  2. **Silently dropped props.** The fallback branch forwarded only `className`
     and `children`; `id`, `aria-*` and `data-*` on any `Reveal`/`StaggerItem`
     vanished for reduced-motion users. `HTMLMotionProps` made this type-clean.
  3. **`children` needed a cast** (`children as ReactNode`) purely because the
     fallback rendered a plain `div`; removing the branch removed the cast.
  Also switched `staggerChildren`/`delayChildren: number` to
  `delayChildren: stagger(step, { startDelay: delay })` — the numeric form is
  deprecated in `motion-dom`'s types, and `stagger` is a real runtime export of
  framer-motion 13 (verified by import, not by reading the `.d.ts`).
  `src/components/ui/motion.test.tsx` now server-renders every primitive and
  asserts both that children survive and that `delay`/`step`/`y` do not leak into
  the DOM.

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

## Device Pairing Update (2026-09-03)

- Added an authenticated, ownership-scoped `GET /api/devices/[deviceId]/status`
  endpoint. It reads the short-lived Redis challenge and converts real QR
  payloads to a data URL server-side; no device credentials or phone numbers
  are returned.
- Device creation now generates the label (`Perangkat N`) inside the
  serialisable transaction. The user form no longer accepts a device name and
  opens the reusable pairing modal after creation.
- The pairing modal polls the status endpoint, supports QR and pair-code tabs,
  expiry/retry/connected states, clipboard copy, cleanup on close/unmount, and
  `libphonenumber-js` validation with an ISO country selector. Backend
  normalization remains authoritative and accepts the selected country only
  for local ambiguous input.
- Fixed the dashboard root navigation matcher so `/dashboard` is not active on
  every child route. Device UI text was localized to Indonesian.
- Verified editor diagnostics and `npm.cmd run lint`, `npm.cmd run typecheck`,
  focused device validation tests, and `npm.cmd run build` in this session.
  A real QR/pair-code session was not manually exercised because it requires a
  running worker, Redis, and an actual WhatsApp device.

## Custom Pairing Code Update (2026-09-03)

- Read the installed package documentation for `@rexxhayanasi/elaina-baileys`.
  Custom pairing uses `requestPairingCode(phoneNumber, customCode)` and the
  custom value must be exactly 8 characters. The provider owns registration and
  expiry; the application does not invent or persist codes.
- Added optional server-validated alphanumeric `customCode` input and carried
  it through the device action, queue payload, worker and isolated WhatsApp
  adapter. Pairing code TTL now matches the documented provider window of 180
  seconds.
- Added focused validation coverage: custom code accepted at exactly 8
  characters and rejected otherwise. Focused test passed (11 tests), editor
  diagnostics are clean, and lint/typecheck/build were run after the update.

## Admin Target Import and UI Update (2026-09-03)

- Fixed the target worker using the file-byte limit as the accepted-number limit;
  imports now use the explicit `MAX_TARGET_NUMBERS` cap of 100,000.
- Headerless CSV/TXT imports are treated as number-only files. Headerless CSV
  rows with extra columns are recorded as invalid instead of silently ignoring
  metadata. Headered CSV files continue to support recognized phone columns.
- Added parser regression coverage for number-only CSV detection. Focused parser
  tests pass (14 tests).
- Refreshed the ADMIN shell, overview copy, target-list page, upload dropzone,
  status labels, and reconciliation messaging in Bahasa Indonesia. The upload
  UI now clearly states that files must contain one number per row.
- Editor diagnostics are clean. Lint, typecheck, focused parser tests, and a
  production build were run; the terminal session sometimes interleaved output,
  but no command reported a code error after the final changes.

## Upload Queue Fix (2026-09-03)

- Diagnosed the reported upload failure: BullMQ rejected deterministic custom
  job IDs containing `:` with `Custom Id cannot contain :` after the target-list
  audit transaction had completed.
- Changed target import, blast delivery, and device session job IDs to use `-`
  separators. Deduplication remains deterministic and BullMQ-compatible.
- Verified editor diagnostics, lint, typecheck, and target parser regression
  tests after the fix. New uploads require the worker to be running to process
  the queued import; previously failed uploads must be submitted again.

## Campaign Content and Pairing Policy Update (2026-09-03)

- Campaign delivery now carries the existing snapshot CTA label/URL into the
  worker and renders it through Elaina Baileys `Button.addUrl()`. Optional JPG,
  PNG, and WebP campaign media is stored in private storage; its caption remains
  part of the campaign snapshot and is used as the button body.
- Custom pairing code is now an ADMIN-only global setting
  (`device.custom_pairing_code`). USER pairing actions and UI no longer accept
  or submit a custom code. The provider still receives the setting only through
  the isolated WhatsApp adapter and validates the eight-character format.
- No database migration was required because campaign media/CTA snapshot
  fields and the settings JSON table already existed.
- Editor diagnostics are clean. Lint/typecheck and focused campaign/device
  checks were run; production build reached the optimized build stage, but the
  terminal session did not return a reliable final exit line.

## Stable QR and Pairing Update (2026-09-03)

- Extracted Redis challenge storage into `lib/device/challenge-store.ts`, so
  the authenticated device status route no longer imports a worker module.
- The status route now returns only the real short-lived QR payload or provider
  pairing code after session and device ownership checks. The browser generates
  the QR image with `qrcode`; no QR data is persisted in browser storage.
- Added expiry cleanup, stale-challenge clearing before a new request, abortable
  polling, and retry submission that actually regenerates the selected challenge.
  A live challenge prevents duplicate pairing requests; expired challenges can
  be requested again.
- Pairing errors expose only the safe device error code/status to the owner.
  Custom pairing code remains sourced exclusively from the global ADMIN setting.
- Focused pairing/phone tests pass (24 tests), editor diagnostics are clean, and
  lint/typecheck/build were run after the update. A real WhatsApp device flow
  still requires the worker, Redis, and a physical account session.

## Pairing Visibility and Worker Stability Update (2026-09-03)

- Fixed stale BullMQ pairing jobs: every device-session attempt now gets a
  unique compatible job ID, while a Redis per-device lock prevents duplicate
  active pairing requests.
- Replaced stale in-process WhatsApp handshakes before starting a fresh one, so
  regenerated QR/pairing requests receive current callbacks and challenges.
- Worker/provider startup failures now move the device from CONNECTING to ERROR,
  clear the challenge, and release the pairing lock instead of leaving the UI at
  “waiting for worker”. Terminal states also clear stale Redis challenges.
- The frontend renders the real QR payload locally and retries by submitting a
  new pairing action. It aborts overlapping status polls.
- Strict typecheck and editor diagnostics pass after the final changes. Real
  QR/pairing verification still requires Redis, the worker process, and a real
  WhatsApp account.

## Pairing Compile Fix (2026-09-03)

- Fixed QR challenge union narrowing in the frontend by separating QR and
  pairing-code challenge variables before rendering.
- Fixed the CTA builder to use the active socket handle and narrowed the CTA
  value before accessing its fields.
- Added CTA snapshot fields to the worker delivery query so campaign buttons
  type-check and survive into delivery.
- Editor diagnostics are clean for all affected files. A terminal typecheck
  invocation was blocked by the local PowerShell/npm resolution issue.

## Auto-Reconnect Update (2026-09-03)

- Added bounded worker-side auto-reconnect for already authenticated WhatsApp
  sessions after unexpected disconnects. Backoff is 5s, 15s, 30s, 60s, and
  120s, capped at five attempts.
- Reconnect jobs use auth state only and do not create a new QR or pairing-code
  challenge. Pairing attempts, logout/expired sessions, and manual disconnects
  do not auto-reconnect.
- Reconnect scheduling is atomic on the `DISCONNECTED` state and the attempt
  counter resets when the device reaches `CONNECTED`.
- Device session jobs now use unique BullMQ IDs, while pairing locks still stop
  duplicate active pairing requests.
- Editor diagnostics are clean and lint/full unit test commands were run. The
  terminal's typecheck invocation was intermittently blocked by PowerShell
  `npm.cmd` resolution, so a real device reconnect still needs worker, Redis,
  and WhatsApp session verification.

## Restart-Required (515) Pairing Update (2026-09-04)

WhatsApp ends a successful link by closing the socket with `restartRequired`
(status 515). Previously that close was handled as a generic disconnect: the
worker cleared the Redis challenge and released the pairing lock at the exact
moment the restart was required, requeued a CONNECT job that had lost its
`pairing` payload, and waited for the 5s–120s BullMQ backoff. Pairing therefore
appeared to fail right after the user scanned or entered the code. The restart
now lives in the adapter.

- `src/lib/whatsapp/adapter.ts`: `connect` only dedupes; a new private
  `openSocket(params, restartAttempt)` builds one socket generation. On a 515
  close the adapter flushes credentials, waits 1s and constructs a **new**
  socket from the saved creds — required because Baileys' `end()` calls
  `ev.destroy()`, so the old socket can never be reused. Bounded by
  `MAX_RESTART_ATTEMPTS = 3`, after which the update carries
  `RESTART_EXHAUSTED`.
- Credential writes are serialised through a `persistCreds` promise chain
  instead of fire-and-forget, and `isNewLogin` awaits it. Without this the
  replacement socket reads a pre-pairing snapshot and starts the handshake
  again.
- `SocketHandle` gained `disposed`, set by `disconnect`/`logout`, so a
  deliberate teardown is never mistaken for a 515. A stale-generation guard
  (`sockets.get(deviceId) !== handle`) drops trailing events from a superseded
  socket.
- `requestPairingCode` is now gated on `restartAttempt === 0` and on
  `!creds.registered`: re-requesting a code against paired credentials
  invalidates the session. `qrTimeout` is passed so the library's QR rotation
  matches the advertised 60s TTL, and a QR is forwarded when no pairing method
  was requested (silent reconnect) but never during a pair-code flow.
- `ConnectionUpdate.restarting` (new, in `src/lib/whatsapp/types.ts`) marks the
  `PAIRED` and `RESTART_REQUIRED` updates. `src/worker/device-session-runner.ts`
  responds by clearing the spent challenge and calling the new
  `renewPairing(deviceId, 120)` in `src/lib/device/challenge-store.ts` instead
  of releasing the lock, and the old `DISCONNECT_515` requeue is gone, so 515 no
  longer touches the reconnect backoff.
- Storage: `src/lib/whatsapp/auth-state.ts` now revives `app-state-sync-key`
  values through `proto.Message.AppStateSyncKeyData.fromObject` (mirroring the
  library's own file store). JSON round-tripping had been dropping the protobuf
  prototype, which breaks app-state sync immediately after pairing. `proto` is
  re-exported from the package root, so this stays inside `src/lib/whatsapp/`.
- Frontend: `/api/devices/[deviceId]/status` returns a derived `restarting`
  flag (`CONNECTING` plus `PAIRED`/`RESTART_REQUIRED`) and sends `no-store` on
  both branches. `src/components/devices/device-pairing-modal.tsx` renders a
  dedicated "Menyelesaikan koneksi" state ahead of the challenge branches, an
  `m:ss` countdown driven by a 1s tick, and distinct copy for an expired
  challenge instead of claiming the connection failed. The QR data URL is now
  keyed by its payload so no `setState` runs synchronously in an effect (the
  React Compiler lint rules reject that).
- Copy in `src/app/actions/devices.ts` and
  `src/components/devices/device-card.tsx` was unified to Indonesian.

### Verification

- `npm run lint` — clean (one pre-existing `@next/next/no-img-element` warning
  on the QR `<img>`; the QR is a runtime data URL and must not be optimised).
- `npm run typecheck` — clean.
- `npm run test` — 18 files, 191 tests, all green, including the new
  `src/lib/whatsapp/adapter.test.ts` (11 tests: 515 rebuild, `isNewLogin`,
  creds-before-reload ordering, stale-generation guard, restart budget,
  logged-out cleanup, deliberate disconnect, and the four pairing-challenge
  cases). Baileys and the auth state are mocked, so no socket is opened.
- `npm run build` — succeeded.
- Still unverified against a real device: the restart has not been observed
  against WhatsApp itself (see gap 2).

## Known Gaps

1. **Integration coverage is delivery-only.** `tests/integration/delivery-invariants.integration.test.ts`
   covers concurrent claiming, `markSending` ownership, lease expiry and crash
   recovery, clean-stop release, earning idempotency (replay and concurrent) and
   the failure/ambiguity paths — 12 tests, all green against MariaDB 11.4. Auth,
   device limits, target import, campaign assignment, wallet and withdrawal still
   have no integration tests. No E2E tests exist at all.
2. **WhatsApp adapter unexercised.** Pairing, QR, reconnect and send have not run
   against a real device. The 515 restart path is covered by mocked unit tests
   only.
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
7. **The redesign is verified by build, not by eye.** Lint, typecheck, unit tests
   and `next build` all pass, and the layout is built from responsive primitives
   (mobile-first grids, `min-[480px]`/`xl` breakpoints, 44px touch targets,
   desktop sidebar + mobile bottom tabs). But no page was rendered in a real
   browser at 375 / 768 / 1440 px, no Lighthouse run was taken, and contrast
   ratios were chosen from `oklch` lightness steps rather than measured. Visual
   regressions, focus-order problems and animation jank would not be caught by
   anything currently in `npm run verify`.

## Next Task

### Device pairing rate limits (2026-09-03)

- Default and seeded maximum devices per user are now 5.
- Pairing attempts are limited to 5 per device per 10 minutes, with an
  aggregate limit of 25 per user per 10 minutes. Both limits use shared Redis
  counters and remain safe across multiple web instances.
- Existing databases keep their current `device.max_per_user` setting; update
  it to 5 through ADMIN Settings (or rerun the seed in a disposable database).

1. Resolve gap 4: decide whether dev moves to port 3307, and apply the migration
   there if so.
2. Exercise `npm run worker` against a real device for one small seeded campaign,
   end to end, and record what the WhatsApp adapter actually does on pair,
   reconnect and send. Confirm specifically that the 515 restart re-attaches on
   the second socket generation and that the pairing lock survives it.
3. Extend integration coverage outward from delivery: device limits, target
   import, then withdrawal hold/release.
4. Add a checked-in smoke test for the HTTP surface (gap 6) so route-level 500s
   are caught by `npm run verify` instead of by hand.
5. Re-run `npm run verify` plus `npm run test:integration` after each of the
   above.
6. Close gap 7: open every route at 375 / 768 / 1440 px, tab through each form
   to confirm focus rings and order, and take a Lighthouse run on one dashboard
   and one admin page.


