# WhatsApp Blast Platform

Consent-based WhatsApp campaign delivery with operator payouts. Administrators
own campaigns and target data; operators connect their own devices and run blast
jobs against assigned campaigns.

## Stack

- Next.js App Router, TypeScript strict mode
- MySQL via Prisma ORM (migrations only, never `db push` in production)
- Redis + BullMQ for delivery, imports, device sessions and maintenance
- Auth.js / NextAuth v5 with credentials, JWT sessions and a session epoch
- Tailwind CSS + shadcn/ui, Framer Motion, Lucide icons
- Cloudflare Turnstile on registration, login and money-moving forms
- `@rexxhayanasi/elaina-baileys` behind a single WhatsApp adapter

## Roles

There are exactly two roles.

**ADMIN** creates and controls campaigns, uploads and manages target lists, sets
payout rates, quotas, speed policy and assignment, manages users, settings,
balances and withdrawals, and reads the audit log.

**USER** (operator) connects their own devices, starts blast jobs for assigned
active campaigns, watches their own progress and earnings, sets a payout wallet
once, and requests withdrawals. An operator can never create a campaign, see a
target number, or read another account's data.

## Local setup

```bash
npm install
cp .env.example .env        # then fill in real values
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run db:seed             # settings rows + bootstrap admin
npm run dev                 # web
npm run worker              # queue worker, separate process
```

Redis and MySQL must be reachable before the web app or worker will start.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run worker` | BullMQ worker (required in production) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run db:seed` | Seed settings and the bootstrap admin |

## Architecture

```
src/app/          routes, layouts and server actions (thin)
src/lib/…         services: auth, campaign, target, blast, delivery, ledger,
                  wallet, withdrawal, admin, settings, security, whatsapp
src/worker/       queue workers, run as their own process
prisma/           schema, migrations and seed
```

Server actions and route handlers validate input with Zod, then delegate to a
service. Business rules, transactions and money maths live in the service layer.
React components never touch the database.

## Delivery integrity

- Sending happens only in the worker; no request handler loops over recipients.
- Recipients follow a state machine with atomic claim/lease semantics, so
  concurrent workers cannot process the same recipient twice.
- Earnings are credited only after a confirmed `SENT`, through an immutable
  ledger entry with a deterministic idempotency key.
- Ambiguous results move to `RECONCILIATION_REQUIRED` and are never auto-retried.
- Allowed speeds are 1, 3, 6 and 10 seconds, enforced server-side.

## Money

All monetary values are fixed-point decimals (`DECIMAL(18,4)` in MySQL,
`decimal.js` in application code). Withdrawals create a negative hold entry
atomically; rejection or cancellation appends a compensating release rather than
deleting the hold.

## Security

- RBAC is enforced in `proxy.ts`, every server action and every service.
- Identity and role always come from the verified server session.
- Redis-backed rate limits on login, registration, pairing, wallet and
  withdrawal paths.
- WhatsApp credentials and wallet details are encrypted at rest; wallet data is
  masked in every UI surface.
- Target uploads and device sessions live in private storage, never `public/`.
- Sensitive admin operations write immutable audit entries.

## Compliance

This platform is intended only for recipients with valid consent or an existing
transactional relationship. It contains no functionality for bypassing WhatsApp
policy, rate limits, CAPTCHAs or account restrictions.
