# WhatsApp Blast SaaS — Agent Instructions

## Read First

Before doing any work:

1. Read this file completely.
2. Read `/RULES.md`.
3. Read all relevant files in `memory-bank/` if the folder exists.
4. Inspect the existing repository before creating, replacing, moving, or deleting files.
5. Explain the plan and affected files before making major architectural, database, security, dependency, or queue changes.
6. Preserve the existing project structure, conventions, API contracts, and UI/UX unless a change is explicitly required.

## Core Business Rules

This application has exactly two roles:

- ADMIN
- USER

### ADMIN is allowed to

- Manage users, settings, device policy, pair-code policy, balances, withdrawals, logs, audits, and monitoring.
- Upload, validate, manage, archive, assign, and monitor target numbers from the **Target Nomor** menu.
- Configure the message and sending rules associated with target-number allocations: message type, message text, image/media, button/CTA configuration, speed/delay, payout rate, quota, assignment, and schedule where available.
- Allocate target numbers to eligible users and view allocation, sending, and delivery statistics.
- View target numbers and complete operational data only where authorized.

### USER is allowed only to

- Connect and manage their own WhatsApp devices.
- Use the **Device** page to view their remaining allocated targets and perform eligible blast actions.
- Start bulk blast to all eligible connected devices or single-device blast to one eligible connected device.
- View only their own per-device blast progress, earnings, withdrawal history, and profile.
- Set their withdrawal wallet once.
- Change their own password.
- Pause/stop their own blast job when policy permits it.

### USER must never be able to

- Create, edit, delete, schedule, pause, resume, archive, or manage a campaign.
- View or access a Campaign menu, Campaign page, or campaign-management feature.
- View or access a Blast menu/page; blast actions belong only in the Device page.
- Upload, browse, export, download, modify, or inspect raw target lists.
- View raw target phone numbers.
- Change admin-configured message content, media, CTA/button configuration, target allocation, payout, quota, schedule, or assignment.
- Access another user’s device, blast job, balance, withdrawal, wallet, log, or personal information.
- Access global settings, admin panel, or operational monitoring.

## Navigation Rules

### ADMIN sidebar

- There must be **no Campaign menu**.
- Target-number management and its message/blast configuration belong in the existing **Target Nomor** menu/page.
- Retain other existing authorized admin menus and their current behavior unless explicitly changed.

### USER sidebar

USER must only see these application menus:

- Home
- Device
- Wallet
- Profile

Rules:

- Remove the Campaign menu entirely.
- Remove the Blast menu entirely.
- Do not leave orphaned routes, navigation links, redirects, buttons, or UI references that expose Campaign or Blast to USER.
- Place all user blast controls, allocation information, delivery progress, and relevant logs in the existing Device page.

## Target Nomor Rules

Target-number management is administered exclusively from the existing **Target Nomor** page.

### Admin configuration

Allow ADMIN to configure, using the project’s existing patterns and components:

- Message type: text-only, image/media message, or button/CTA message.
- Message body/content.
- Image/media upload or selection when the selected message type requires it.
- Button/CTA configuration when the selected message type requires it.
- Blast speed/delay per target number, using allowed values of 1, 3, 6, or 10 seconds; custom delay is allowed only if the current project policy explicitly supports it.
- Target-number upload/import and manual management using existing supported formats and flows.
- Target-number allocation to a selected USER.
- Allocation quota and remaining allocation tracking.

### Allocation and visibility

- Target numbers, message settings, and blast configuration are controlled by ADMIN only.
- USER may see only aggregate allocation information, such as remaining allocated number count and operational progress; never raw target numbers.
- Preserve the existing allocation model when possible. Do not introduce a separate campaign model, new API surface, or unnecessary architectural rewrite for this change.
- Track number states safely: pending, claimed, sending, sent, retryable failed, failed, cancelled, skipped, unknown, and reconciliation required.

## Device and Blast Rules

All user blast functionality belongs in the existing **Device** page.

### Device limits and identity

- The default maximum is **5 active WhatsApp device connections per USER**.
- Enforce the device limit server-side, transactionally, and never only in UI.
- Each device must have a generated, immutable unique identifier when created/connected, following the existing project naming convention; if none exists, use `device-{userId}-{uuid}`.
- Display a safe non-secret device identifier in the UI where the existing design permits it.
- Device statuses include Connected, Disconnected, Connecting, and Shadow Ban/Restricted where detected.
- On confirmed shadow ban/restriction according to existing safety policy, disconnect and securely remove the relevant session material. Do not falsely label ordinary connection failures as shadow bans.

### Allocation information

The Device page must show:

- Remaining target allocation for the current USER, for example: `Alokasi nomor tersisa: X`.
- Connected-device count, for example: `X dari 5 device terhubung`.
- Aggregate and per-device sending progress, including pending, successful, failed/error, and total processed counts.
- Only user-owned and authorization-safe data.

### Blast actions

On the Device page, provide eligible USERs with:

- **Bulk blast**: send through all of the USER’s eligible connected devices.
- **Single-device blast**: send through one selected eligible connected device.
- Speed selection only when the existing admin policy permits user choice; otherwise display and enforce the delay configured by ADMIN in Target Nomor.
- Clear loading, confirmation, disabled, validation, error, and completion states.
- Per-device delivery status and progress based on authoritative backend recipient states, not client-side counters.

Rules:

- A USER can send only to targets allocated to that USER.
- A USER cannot alter target numbers or admin-configured message/media/button content.
- Bulk and single blast must use the existing background queue/worker architecture; never create long-running send loops in API routes, server actions, React components, or browser code.
- Maintain idempotency, concurrency protection, state checks, accounting integrity, and existing safe retry/reconciliation behavior.

### Delivery logs

- Show USER only their own safe per-device delivery logs and aggregate statistics.
- Do not expose raw target phone numbers; mask or omit recipient identifiers according to the existing privacy rules.
- Support existing filtering patterns for success, error, pending, and other operational states where applicable.
- Automatically clear or archive user-visible delivery logs after 24 hours according to the project’s server-side retention policy; preserve secure audit/financial records where required.

## QR Code and Pair Code Rules

Update the existing Device connection modal/flow without changing unrelated connection architecture.

### QR Code tab

- When USER switches to the QR Code tab, immediately request/create the connection session and render the QR code.
- QR Code flow must not require the USER to enter a phone number first.
- Prevent duplicate concurrent session requests caused by repeated tab switches, re-renders, or rapid clicks.
- Show clear loading, QR expiry, refresh, connection-success, and connection-error states using existing UI patterns.

### Pair Code tab

- Preserve the existing Pair Code flow.
- USER must enter the WhatsApp phone number that will be connected before requesting a pairing code.
- Validate and normalize the submitted phone number server-side using the project’s existing rules.
- Request/generate the pairing code only after valid phone-number input and required security checks.

## Consent and Platform Safety

This system is only for recipients with valid consent or a legitimate transactional/service relationship.

Never implement:

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

- Preserve and follow the existing scalable project structure; do not create a replacement architecture for this update.
- Keep UI, authentication, validation, server actions, route handlers, service layer, Prisma/database logic, queue worker, WhatsApp integration, and logging separated.
- React components must not perform direct database access.
- Route handlers and server actions must be thin; business rules belong in services.
- WhatsApp integration must be isolated in one adapter/service layer.
- Queue workers must run separately from the Next.js web process in production.
- Never enforce security only in the frontend.
- Every sensitive server operation must validate auth, role, ownership, input, and relevant state transitions.
- Reuse existing endpoints, services, components, state patterns, and contracts where possible; do not add new API endpoints merely for this UI/feature relocation unless the existing system cannot support it.

## Auth and Security

- Enforce ADMIN/USER RBAC in middleware, server handlers/actions, and service layer.
- Never trust `userId`, `role`, amount, target allocation ID, device ID, speed, or status from the client.
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

## Target Import Rules

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

- USER runs blast jobs only for targets allocated by ADMIN and only through eligible connected devices.
- Allowed sending speeds are only 1, 3, 6, and 10 seconds, enforced server-side.
- The default device limit is maximum 5 active devices per USER and may be admin-configurable only if such configuration already exists or is explicitly requested.
- Use BullMQ and Redis for delivery. Never send messages in a request-response loop.
- Delivery must be idempotent and safe under concurrent workers, retries, server crashes, and duplicate client submissions.
- Use allocation-specific recipient records; do not use one global `isUsed` flag as the only tracking mechanism.
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
- Enforce unique recipient identity within the appropriate target allocation scope.
- Before every send, re-check user status, job status, device status, recipient lock owner, and lease validity.
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

- **Adapt to the existing project UI/UX. Do not redesign the product or introduce a new visual system.**
- Reuse existing components, layouts, typography, color tokens, spacing, border radii, shadows, icons, themes, animation patterns, responsive breakpoints, loading states, modals, tables, and form patterns.
- Keep the current sidebar/header behavior and update only the required navigation items for each role.
- Build mobile-first and preserve existing dark/light-mode behavior if implemented.
- Use Framer Motion only in the project’s established animation style; respect `prefers-reduced-motion` and prefer `transform` and `opacity` animations.
- Provide loading, skeleton, empty, error, success, disabled, and confirmation states for asynchronous UI.
- Use responsive table alternatives for mobile.
- Touch targets must be at least 44 by 44 pixels.
- Do not expose sensitive target, credential, device session, or wallet information in UI.

## Database Rules

- Use Prisma migrations for schema changes.
- Do not use `prisma db push` in production.
- Use UTC timestamps in database.
- Use Decimal type for money, payout, fee, balance, and withdrawal amount.
- Create indexes for foreign keys, status, timestamps, common filters, allocation IDs, blast-job IDs, target lists, and recipient states when schema changes require them.
- Create unique constraints for email, settings keys, ledger idempotency keys, target list plus normalized number, and recipient identity within its allocation scope.
- Use transactions for device limits, blast-job creation, recipient claim, successful send ledger credit, withdrawal hold/reversal, and admin balance adjustment.
- Never keep a database transaction open while waiting for WhatsApp/network response.
- Archive/soft-delete records with financial, audit, delivery, or withdrawal history.
- Make the smallest backwards-compatible schema change necessary; inspect the current schema before modifying it.

## Testing and Verification

Before marking work complete:

- Add/update tests for affected validation, RBAC, ownership, device limits, QR/pair-code flows, allocation visibility, state transitions, ledger idempotency, and file parsing where relevant.
- Add/update integration tests for affected auth, device connections, target import/allocation, bulk blast, single-device blast, queue claims, recovery, earnings, wallet, and withdrawal flows where relevant.
- Add E2E tests for important updated admin/user flows where practical.
- Test that USER cannot access Campaign or Blast menus/routes/pages.
- Test that ADMIN has no Campaign menu and can configure message type/media/button/delay in Target Nomor.
- Test that USER cannot view raw target numbers or alter admin configuration.
- Test the max-5-device limit and concurrent device-creation attempts.
- Test QR tab session request occurs once per intended connection attempt and Pair Code requires a valid phone number.
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
- Do not add, restore, or expose Campaign features/menus/pages for ADMIN or USER.
- Do not add, restore, or expose a separate Blast menu/page for USER.
- Do not expose target numbers to USER.
- Do not blindly retry ambiguous sends.
- Do not credit user balance without ledger and idempotency protection.
- Do not process mass targets directly in frontend/API request loops.
- Do not replace existing project structure, UI/UX, or working API contracts unnecessarily.
- Do not claim implementation is complete without testing and verification.
