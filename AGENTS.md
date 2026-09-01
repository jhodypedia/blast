# WhatsApp Blast SaaS — Agent Instructions

## Read First

Before doing any work:

1. Read this file completely.
2. Read `/RULES.md`.
3. Read all relevant files in `memory-bank/` if the folder exists.
4. Inspect the existing repository before creating, replacing, moving, or deleting files.
5. Explain the plan and affected files before making major architectural, database, security, dependency, or queue changes.

## Core Business Rules

This application has exactly two roles:

- ADMIN
- USER

ADMIN is the only role allowed to:

- Create, edit, schedule, activate, pause, resume, cancel, archive, and manage campaigns.
- Upload, validate, manage, archive, assign, and attach target lists to campaigns.
- Control campaign content, target list, payout rate, quota, speed policy, assignment, and schedule.
- Manage users, settings, device policy, pair-code policy, balances, withdrawals, logs, audits, and monitoring.
- View target numbers and complete operational data only where authorized.

USER is allowed only to:

- Connect and manage their own WhatsApp devices.
- View ADMIN-created campaigns assigned/available to them.
- Start a blast job for an eligible ADMIN campaign.
- Select an eligible device and an allowed speed.
- View only their own blast-job progress, earnings, withdrawal history, and profile.
- Set their withdrawal wallet once.
- Change their own password.
- Pause/stop their own blast job when campaign policy permits it.

USER must never be able to:

- Create, edit, delete, schedule, pause, resume, archive, or manage a campaign.
- Upload, browse, export, download, modify, or inspect target lists.
- View raw target phone numbers.
- Change campaign message, media, CTA, target, payout, quota, schedule, or assignment.
- Access another user’s device, blast job, balance, withdrawal, wallet, log, or personal information.
- Access global settings, admin panel, or operational monitoring.

## Consent and Platform Safety

This system is only for recipients with valid consent or a legitimate transactional/service relationship.

Never implement:

- WhatsApp policy bypasses.
- Anti-spam bypasses.
- CAPTCHA bypasses.
- Rate-limit bypasses.
- Account restriction bypasses.
- Functionality intended for unsolicited messaging.
- Automatic resend for ambiguous delivery status.

## Required Stack

- Next.js App Router.
- TypeScript strict mode.
- npm only.
- Tailwind CSS.
- shadcn/ui.
- Framer Motion for performant animations.
- Lucide React for main UI icons.
- React Icons or Iconify only for colored bank/e-wallet/service icons.
- MySQL.
- Prisma ORM with migrations.
- Auth.js / NextAuth v5 via `next-auth`.
- Credentials login with email/password.
- bcryptjs or Argon2 for passwords.
- Zod validation.
- React Hook Form with Zod resolver.
- Redis.
- BullMQ.
- `@rexxhayanasi/elaina-baileys` through one isolated WhatsApp adapter/service.
- Cloudflare Turnstile.
- TanStack Query when client server-state caching is necessary.
- Zustand only for small UI state.

Do not use:

- pnpm.
- yarn.
- bun.
- `@auth/nextjs`.
- Direct `@auth/core` installation unless verified as specifically required.
- JavaScript float for financial calculations.
- Long-running send loops inside API routes, server actions, React components, or browser code.

## Architecture Principles

- Let Kilo Code create the most suitable scalable project structure.
- Keep UI, authentication, validation, server actions, route handlers, service layer, Prisma/database logic, queue worker, WhatsApp integration, and logging separated.
- React components must not perform direct database access.
- Route handlers and server actions must be thin; business rules belong in services.
- WhatsApp integration must be isolated in one adapter/service layer.
- Queue workers must run separately from the Next.js web process in production.
- Never enforce security only in the frontend.
- Every sensitive server operation must validate auth, role, ownership, input, and relevant state transitions.

## Auth and Security

- Enforce ADMIN/USER RBAC in middleware, server handlers/actions, and service layer.
- Never trust `userId`, `role`, amount, campaign ID, device ID, speed, or status from the client.
- Always take identity and role from the verified server-side session.
- Validate all request input with Zod.
- Use Redis-based rate limits for login, registration, reset password, pairing, withdrawal, and sensitive mutations.
- Verify Turnstile server-side only.
- Hash passwords securely.
- Do not expose stack traces, SQL errors, secrets, credentials, QR values, pairing codes, target data, or unmasked financial details.
- Encrypt WhatsApp session credentials and wallet/account details at rest.
- Mask sensitive account data in UI.
- Store target uploads and device-session material in private storage only.
- Create audit logs for all sensitive admin operations.

## Campaign and Target Rules

- ADMIN uploads target lists in TXT/CSV format; XLSX is optional only after secure parser and capacity evaluation.
- Target files contain phone numbers only.
- Normalize numbers to canonical international format.
- Do not automatically prefix every number with `62`.
- Use default country code only for local numbers that have no prefix, based on admin settings.
- Deduplicate targets within a list.
- Use database uniqueness constraints to prevent duplicate normalized numbers in the same target list.
- Large target imports must be streaming/chunked and processed through BullMQ.
- Never load tens of thousands of target numbers into browser memory or a single HTTP request lifecycle.
- USER must never see raw target numbers.

## Blast and Delivery Integrity

- USER runs blast jobs only for ADMIN-created and assigned ACTIVE campaigns.
- Allowed sending speeds are only 1, 3, 6, and 10 seconds, enforced server-side.
- Device limit defaults to maximum 4 active devices per user and must be admin-configurable.
- Use BullMQ and Redis for delivery. Never send messages in a request-response loop.
- Delivery must be idempotent and safe under concurrent workers, retries, server crashes, and duplicate client submissions.
- Use campaign-specific recipient records; do not use one global `isUsed` flag as the only tracking mechanism.
- Use a recipient state machine:
  - PENDING
  - CLAIMED
  - SENDING
  - SENT
  - RETRYABLE_FAILED
  - FAILED
  - CANCELLED
  - SKIPPED
  - UNKNOWN
  - RECONCILIATION_REQUIRED
- Use atomic database claim/lock/lease logic for recipients.
- Enforce unique recipient identity per campaign.
- Before every send, re-check user status, campaign status, blast-job status, device status, recipient lock owner, and lease validity.
- Credit earnings only after a delivery is confirmed as SENT.
- Never credit earnings twice for the same recipient.
- Use immutable ledger entries with unique idempotency keys.
- Never retry an UNKNOWN or ambiguous delivery automatically.
- Use reconciliation flow for ambiguous sends.
- Progress must come from authoritative database recipient states, not client counters.

## Wallet and Withdrawal

- USER can set wallet only once: full name, bank/e-wallet provider, account/e-wallet number.
- Wallet details must be encrypted at rest and masked in UI.
- Wallet changes require a controlled review/approval policy.
- Withdrawal requires sufficient available ledger balance.
- Use Decimal-safe calculations.
- On withdrawal request, atomically create a reserve/hold ledger entry.
- Prevent double withdrawal.
- On reject/cancel, create a ledger reversal/release entry.
- ADMIN controls approval, rejection, processing, and paid status with audit logs.
- Protect withdrawal with Turnstile, server validation, rate limit, and confirmation flow.

## UI/UX Requirements

- Build premium, clean, modern, business-grade UI.
- Mobile-first and fully responsive.
- Support dark and light mode.
- Use semantic colorful icons:
  - Blue/purple for primary navigation/actions.
  - Green/emerald for successful delivery, earnings, connected devices.
  - Yellow/orange for pending/warning.
  - Red/rose for errors/destructive actions.
  - Teal/cyan for information/secondary actions.
- Use Framer Motion for subtle, performant animations.
- Respect `prefers-reduced-motion`.
- Prefer `transform` and `opacity` animations.
- Provide loading, skeleton, empty, error, success, disabled, and confirmation states for async UI.
- Use responsive table alternatives for mobile.
- Touch targets must be at least 44 by 44 pixels.
- Do not expose sensitive target, credential, device session, or wallet information in UI.

## Database Rules

- Use Prisma migrations for schema changes.
- Do not use `prisma db push` in production.
- Use UTC timestamps in database.
- Use Decimal type for money, payout, fee, balance, and withdrawal amount.
- Create indexes for foreign keys, status, timestamps, common filters, campaign IDs, blast-job IDs, target lists, and recipient states.
- Create unique constraints for email, settings keys, ledger idempotency keys, target list plus normalized number, and recipient per campaign.
- Use transactions for device limits, blast-job creation, recipient claim, successful send ledger credit, withdrawal hold/reversal, and admin balance adjustment.
- Never keep a database transaction open while waiting for WhatsApp/network response.
- Archive/soft-delete records with financial, audit, campaign-delivery, or withdrawal history.

## Testing and Verification

Before marking work complete:

- Add/update unit tests for validation, normalization, RBAC, ownership, state transitions, ledger idempotency, and file parsing where relevant.
- Add/update integration tests for auth, device limits, target import, campaign assignment, blast-job creation, queue claims, retry, recovery, earnings, wallet, and withdrawal where relevant.
- Add E2E tests for important user/admin flow where practical.
- Test concurrency so multiple workers cannot process the same recipient.
- Test crash/stale-lock recovery.
- Test that a SENT recipient creates only one earning record.
- Run relevant checks:
  - `npm run lint`
  - typecheck command if configured
  - test command if configured
  - `npm run build`
- Report actual command output and remaining errors honestly.
- Update project memory/documentation with the work done, tests run, known limitations, and next action.

## Do Not Do

- Do not use pnpm, yarn, or bun.
- Do not install `@auth/nextjs`.
- Do not use `npm --force` or `npm --legacy-peer-deps` as the default answer to dependency conflicts.
- Do not write raw secrets or private credentials to source code.
- Do not let USER create a campaign.
- Do not expose target numbers to USER.
- Do not blindly retry ambiguous sends.
- Do not credit user balance without ledger and idempotency protection.
- Do not process mass targets directly in frontend/API request loops.
- Do not claim implementation is complete without testing and verification.