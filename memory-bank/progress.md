# Project Memory — WhatsApp Blast SaaS

Last updated: 2026-09-01

## Purpose

Running record of what exists, what is verified, what is not, and what to do
next. Read this together with `RULES.md` and `AGENTS.md` before starting work.

## Current State

The application is feature-complete for the ADMIN and USER surfaces described in
`RULES.md`, and passes lint, typecheck, unit tests and a production build. It has
**not** been run against a live MySQL/MariaDB or Redis instance, so all database,
queue and WhatsApp paths are verified by types and build only.

### Verification (last full run)

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npx eslint src prisma tests --max-warnings=0` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests | `npx vitest run` | exit 0 — 126 tests, 11 files |
| Build | `npx next build` | exit 0 — 22 routes |

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

1. **No live-infrastructure testing.** MariaDB and Redis were unavailable. The
   raw `FOR UPDATE ... SKIP LOCKED` statement has never executed against the real
   database, and the concurrency, stale-lease-recovery and "one SENT recipient
   credits exactly one earning" tests that `RULES.md` §22 requires are therefore
   still missing. These need a live database to be meaningful and are the
   highest-value remaining work.
2. **No integration or E2E tests.** Only unit tests exist (validation,
   normalization, crypto, parser, progress derivation, withdrawal transitions,
   WhatsApp error classification).
3. **WhatsApp adapter unexercised.** Pairing, QR, reconnect and send have not run
   against a real device.
4. **Prisma migrations not applied.** Generated but never run with
   `migrate deploy` against a real server.
5. **Turnstile** falls back to a hidden `development-placeholder` token in the
   widget when no site key is configured. `verifyTurnstileToken` throws
   `CAPTCHA_FAILED` whenever the secret is missing and `NODE_ENV === "production"`,
   and skips only outside production, so a misconfigured production deploy fails
   closed rather than losing protection. The real widget has not been exercised
   end to end.

## Next Task

Bring up MySQL/MariaDB and Redis, then in order:

1. `npm run prisma:deploy` and `npm run db:seed`; fix any migration or seed error.
2. Add `*.integration.test.ts` covering: parallel `claimRecipients` calls never
   returning the same row, expired-lease recovery, and a single earning per
   `SENT` recipient.
3. Exercise `npm run worker` against a real device for one small campaign.
4. Re-run `npm run verify`.
