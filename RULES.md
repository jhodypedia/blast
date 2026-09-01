# WhatsApp Blast SaaS — Kilo Code Project Rules

## 1. Project Goal

Build a production-ready, secure, scalable, responsive, premium WhatsApp blast SaaS application using Next.js App Router and TypeScript.

The application has two roles:

- ADMIN: controls users, target lists, campaigns, global settings, device policy, custom pair-code policy, withdrawals, earnings, logs, monitoring, and audit.
- USER: connects their own WhatsApp device, sees campaigns created by ADMIN, starts permitted blast jobs, monitors their own blast progress, earns only from successful sends, requests withdrawal, and changes their password.

Critical business rules:

- USER MUST NOT create, edit, upload, delete, schedule, or control campaigns.
- ADMIN MUST create and fully control every campaign.
- USER can only perform blast jobs for an ADMIN-created campaign that is assigned and available to them.
- ADMIN uploads target numbers and attaches target lists to campaigns.
- USER must never view, download, export, or access individual target phone numbers.
- USER may only control their own connected devices and their own blast jobs.
- ADMIN is the only role permitted to access raw target-list management and complete operational monitoring.

This system must only be used for recipients who have given valid consent or have a legitimate transactional/service relationship. Do not implement functionality intended to bypass WhatsApp policies, account restrictions, anti-spam controls, platform rate limits, CAPTCHA, or security protections.

## 2. Agent Operating Rules

- Before making changes, inspect the existing repository and read all relevant project documentation.
- If `memory-bank/` exists, read relevant files before starting a task.
- Create an appropriate, maintainable project structure yourself based on Next.js App Router conventions, domain boundaries, scalability, and separation of concerns.
- Do not ask the user to manually create folder structures when you can create them safely.
- Do not put all code in a single file or build monolithic components/services.
- Keep UI, route handlers, server actions, business services, database access, queue workers, authentication, validation, and integrations properly separated.
- Do not invent package APIs, environment variables, database fields, routes, or provider capabilities. Verify the package/documentation or existing codebase when necessary.
- Do not change core architecture, database schema, authentication flow, queue strategy, or major dependencies without explaining the impact first.
- Work incrementally and verify every substantial implementation.
- After important changes, run relevant commands such as lint, typecheck, tests, and production build.
- Do not leave fake production implementations, insecure placeholders, hardcoded secrets, mock balances, or mock authorization checks.
- Use configuration/admin settings or environment variables for assumptions that should be configurable.
- At the end of a task, write/update concise project memory/documentation describing what changed, what is incomplete, known issues, tests run, and the immediate next task.
- Use **npm only**. Do not use pnpm, yarn, bun, or another package manager unless the user explicitly changes this requirement.

## 3. Required Technology Standards

- Use Next.js with App Router.
- Use TypeScript with strict mode enabled.
- Use npm as the package manager.
- Use Tailwind CSS and shadcn/ui for the main design system.
- Use Framer Motion for page transitions, component transitions, micro-interactions, and high-quality motion.
- Use Lucide React as the default icon set.
- Use React Icons or Iconify only for colored service, bank, e-wallet, or brand icons where Lucide is not appropriate.
- Use MySQL for the primary relational database.
- Use Prisma ORM and versioned Prisma migrations.
- Use Auth.js / NextAuth v5 for authentication.
- Use `next-auth` for Auth.js integration.
- Do not use `@auth/nextjs`.
- Do not install `@auth/core` directly unless a verified integration specifically requires it.
- Use email/password credentials authentication.
- Use bcryptjs or Argon2 for password hashing.
- Use Zod for server-side validation of every input.
- Use React Hook Form with a Zod resolver for client forms.
- Use Redis and BullMQ for queueing, scheduled background work, retries, rate limits, import jobs, delivery jobs, recovery, cleanup, and monitoring.
- Use `@rexxhayanasi/elaina-baileys` only through a dedicated WhatsApp integration layer/service adapter.
- Use Cloudflare Turnstile for public or sensitive form protection.
- Use TanStack Query when client-side server-state caching/refetching is beneficial.
- Use Zustand only for lightweight UI state, never as the source of truth for auth, money, delivery, or sensitive business state.
- Prepare the app for Docker, Nginx, HTTPS, health checks, and separate web/worker processes in production.

## 4. Architecture Rules

- Let Kilo Code create an optimal project structure based on the domains in this project.
- Preserve clear boundaries between:
  - UI components
  - Page/layout composition
  - Authentication/session logic
  - Route handlers
  - Server actions
  - Validation schemas
  - Business services
  - Database/repositories
  - WhatsApp device integration
  - Queue producers
  - Queue consumers/workers
  - Logging and audit
  - Admin settings
- React components must not contain sensitive business logic or direct database calls.
- Route handlers and server actions must remain thin; they validate/authenticate and delegate to services.
- Queue workers must remain independent from the Next.js request lifecycle.
- WhatsApp library code must not be scattered across the codebase.
- Create a single integration adapter that owns device lifecycle, QR generation, pair-code flow, send operations, reconnect behavior, and error normalization.
- Create reusable permission helpers so RBAC and ownership checks are not copied inconsistently.
- Use typed domain models and consistent error types.
- Prefer composable services over one giant “service” file.
- Keep database access centralized and testable.
- Do not use client-side code to enforce security. Client restrictions are for UX only; server-side checks are mandatory.

## 5. Authentication and RBAC

Use Auth.js / NextAuth v5 with credential-based email/password login.

Authentication requirements:

- Passwords must always be hashed.
- Passwords and password hashes must never be returned through APIs, server action results, logs, page props, or client state.
- Use secure, HTTP-only cookies in production.
- Verify sessions server-side for all protected operations.
- Make session expiry configurable.
- Invalidate active sessions after password change, user suspension, or admin force logout.
- Add Cloudflare Turnstile to registration, login, password reset, and withdrawal requests.
- Verify Turnstile token only on the server.
- Rate-limit login, registration, password-reset, pairing, and withdrawal endpoints.
- Use generic authentication failures so email existence cannot be enumerated.
- Do not allow public signup to select ADMIN.
- Create the initial admin only via safe bootstrap environment/CLI/internal flow.
- Suspended users must be blocked from login, protected API access, device connection, starting blast jobs, and worker delivery execution.

Roles:

- ADMIN
- USER

RBAC must be enforced through:

- Route protection/middleware.
- Authentication and role validation in every server action or route handler.
- Ownership and permission checks in business services/database queries.

Never trust `userId`, `role`, `campaignId`, `blastJobId`, `deviceId`, amount, speed, campaign status, or any authorization field coming from the browser.

## 6. Access Rules

### ADMIN

ADMIN can:

- Access all administration areas.
- Create, edit, schedule, activate, pause, resume, cancel, archive, and monitor campaigns.
- Upload, validate, manage, archive, assign, and attach target lists to campaigns.
- Manage users, statuses, access, sessions, devices, earnings, withdrawals, and system configuration.
- Review aggregate and detailed operational data.
- Force-stop blast jobs with a reason and audit record.
- Force-disconnect user devices with audit logging.
- Approve, reject, process, and mark withdrawals as paid.
- Adjust balance only through an immutable ledger adjustment with a reason and audit record.
- View logs, audit trails, queue health, failure summaries, and system monitoring.
- Configure site, security, Turnstile, limits, payout, retention, maintenance, and pairing policies.

### USER

USER can:

- Access only their own dashboard.
- Connect, view, and disconnect only their own WhatsApp devices.
- View campaigns created by ADMIN that are currently assigned/available to that user.
- Start a permitted blast job only for an active and eligible ADMIN campaign.
- Choose only an allowed connected device and an allowed speed.
- View only their own blast jobs, aggregate progress, earnings, balances, wallet details in masked form, and withdrawal history.
- Stop/pause only their own blast job when the campaign policy permits it.
- Set a withdrawal wallet once.
- Request withdrawal from available balance.
- Change only their own password.

USER must never:

- Create, update, delete, schedule, pause, resume, archive, or configure campaigns.
- Upload, create, modify, export, download, or browse target lists.
- View individual target phone numbers.
- Change campaign message, media, CTA/link, target list, payout rate, quota, schedule, assignment, or policy.
- Access another user’s resources.
- Change role, global setting, pairing policy, site policy, earnings policy, or withdrawal policy.
- Access raw operational logs, raw device credentials, or admin reports.

## 7. Security Requirements

- Validate all body payloads, URL params, query strings, FormData, settings, and webhook payloads with Zod.
- Use Redis-backed rate limiting for sensitive operations.
- Use proper CSRF-safe patterns for Auth.js and server actions.
- Use HTTPS in production.
- Configure security headers where compatible: CSP, X-Content-Type-Options, Referrer-Policy, framing policy, and restricted CORS.
- Store secrets in environment variables or a secret manager only.
- Never commit secret files, private keys, WhatsApp sessions, QR tokens, pair codes, target files, database backups, Redis dumps, or production logs.
- Sanitize upload file names and user-supplied text.
- Validate upload size, MIME type, extension, and content signature/magic bytes where practical.
- Store uploaded target files privately, never inside publicly served directories.
- Encrypt sensitive data at rest, especially WhatsApp device credentials and wallet/account information.
- Mask account numbers and sensitive references in UI and logs.
- Create immutable audit logs for sensitive admin actions.
- Never return internal stack traces, SQL errors, secrets, raw provider response, or sensitive identifiers to the browser.

## 8. WhatsApp Device Management

- Use `@rexxhayanasi/elaina-baileys` only behind a dedicated service adapter.
- Keep WhatsApp session lifecycle separate from UI and request handlers.
- User can access only their own device records.
- Default maximum is four active devices per user, configurable by ADMIN.
- Enforce device limits atomically to prevent bypass via parallel requests.
- Device states must be explicit:
  - CONNECTING
  - CONNECTED
  - DISCONNECTED
  - EXPIRED
  - ERROR
- Provide protected QR connection flow through an accessible modal.
- QR content must never be written to public storage, browser local storage, audit logs, or analytics.
- Provide protected pair-code connection flow.
- Pair-code phone input must support valid international numbers.
- Normalize numbers to a canonical international representation.
- Do not assume every phone number uses Indonesia country code.
- Use a default country code only when the input is local and lacks a country prefix, based on an admin-configurable setting.
- Rate-limit pair-code requests per user, IP, phone number, and device slot.
- Do not log pair codes.
- Pair codes must expire and disappear from UI as soon as they are no longer valid.
- Do not claim that all countries/numbers will always work; show safe library/provider error states.
- Encrypt device credentials at rest.
- Never send device credentials to the browser.
- Use controlled reconnect backoff with bounded retries.
- Expire inactive devices according to ADMIN policy.
- Device disconnect/delete must safely clean credentials and record an operational/audit event.
- Admin force-disconnect operations must include a reason and audit trail.

## 9. Campaign Rules — ADMIN Only

Campaigns are created and controlled exclusively by ADMIN.

USER must never create or modify campaigns.

Each campaign should support:

- Name.
- Short user-visible description.
- Internal admin-only notes.
- Message text.
- Optional approved media/image with caption.
- Optional CTA/link when supported by capability checks.
- Admin-selected target list.
- Device mode policy: single selected device or all-device mode when enabled.
- Allowed user speed values from 1, 3, 6, and 10 seconds.
- Default or campaign-specific payout per confirmed successful send.
- Per-user quota.
- Maximum concurrent jobs.
- User assignment policy: all eligible users or selected users.
- Schedule start and end.
- Campaign status.
- Archive state.
- Content/version snapshot.

Campaign statuses:

- DRAFT
- SCHEDULED
- ACTIVE
- PAUSED
- COMPLETED
- PARTIAL_FAILED
- CANCELLED
- EXPIRED
- ARCHIVED

Campaign constraints:

- Only an ACTIVE campaign within its schedule window can accept new blast jobs.
- A campaign must be validated before activation.
- An active campaign must have valid content, valid target assignment, configured payout policy, and target list readiness.
- Do not hard-delete campaigns that have delivery, financial, job, or audit history; archive them.
- Changes to payout, content, target allocation, speed rules, or schedule must be snapshotted for existing jobs or applied only to new jobs.
- Every sensitive campaign change must create an audit record.
- Admin can pause/cancel a campaign, and all related running jobs must stop safely before the next send.

## 10. Target Upload and Management — ADMIN Only

Target handling must support tens of thousands to hundreds of thousands of numbers efficiently.

- Only ADMIN can upload, manage, preview, archive, attach, export, or delete target lists.
- USER must not see raw target lists or individual phone numbers.
- Support TXT and CSV at minimum.
- XLSX may be added only if parser security and server resource needs are addressed.
- TXT should use one phone number per line.
- CSV should detect columns such as `phone`, `phoneNumber`, `nomor`, `whatsapp`, `wa`, or safely fall back to first valid column.
- Each row should contain a phone number only; invalid/non-number rows should be marked with a safe reason.
- Normalize whitespace, parentheses, dash, and formatting characters.
- Support international phone-number formats.
- Do not automatically convert every number to country code 62.
- Apply default country code only to local numbers missing a prefix, based on current configuration.
- Store a canonical normalized number format for internal matching.
- Deduplicate within each target list.
- Enforce a database unique constraint for target list plus normalized phone number.
- Show ADMIN import preview: source row count, valid count, invalid count, duplicate count, and at most 10 safe samples.
- Allow ADMIN to export invalid rows/reasons where access policy permits.
- Use configurable file-size and target-count limits.
- Do not load large files fully into memory.
- Use streaming/chunk parsing for large file input.
- Use batch database inserts.
- Run large imports in BullMQ background jobs.
- Support import lifecycle:
  - UPLOADING
  - VALIDATING
  - PARSING
  - IMPORTING
  - READY
  - FAILED
  - ARCHIVED
- Record uploader admin, sanitized original file name, counts, timestamps, and safe import error summary.
- Store original files only if necessary and only in private storage with a retention/cleanup policy.
- Do not allow unsafe deletion of a target list attached to active or historically significant campaigns; archive/soft-delete where appropriate.

## 11. Blast Job Rules — USER Executes, ADMIN Controls Campaign

A blast job is created by USER only for an eligible campaign created by ADMIN.

User may start a blast job only when:

- User is authenticated and active.
- Campaign is ACTIVE.
- Campaign is assigned/available to that user.
- Campaign is within its allowed schedule window.
- User has an eligible CONNECTED device.
- Selected device belongs to the user.
- User has not exceeded maximum active job limit.
- User has not exceeded the campaign quota.
- Campaign still has valid recipients available.
- Selected speed is one of the values allowed by campaign/admin policy.
- User accepted relevant campaign terms if required.

Blast job requirements:

- Blast job belongs to one USER and one ADMIN-created campaign.
- Blast job must use an eligible user-owned device or a safe ADMIN-authorized all-device allocation policy.
- Each job snapshots relevant campaign settings: content version, payout rate, policy, device mode, speed, and quota.
- USER cannot edit message, target, payout, schedule, quota, or delivery policy.
- USER sees only aggregate job progress, not recipient numbers.
- Job states:
  - PENDING
  - QUEUED
  - RUNNING
  - PAUSED
  - COMPLETED
  - PARTIAL_FAILED
  - CANCELLED
  - FAILED
- Blast-job start must be idempotent and protected against double-submit/double enqueue.
- User pause/stop must be server confirmed.
- Worker must re-check campaign/job/device/user state before further sends.
- ADMIN can stop any user job with a reason and audit log.
- Only job owner and ADMIN can see job data.
- Progress must be calculated from authoritative recipient status, not browser counters.

## 12. Delivery Integrity and Duplicate Prevention

Target delivery needs strong idempotency, concurrency control, recovery, and reconciliation.

Important reliability rule:

- If a process crashes after calling send but before recording final result, delivery may be ambiguous.
- Do not blindly resend ambiguous records.
- Mark them as UNKNOWN or RECONCILIATION_REQUIRED and handle through a safe reconciliation workflow.

Do not use one global `isUsed` boolean as the sole delivery mechanism.

Use campaign-specific recipient records or a logically equivalent per-campaign delivery allocation.

Recipient states:

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

Recipient record should include:

- Campaign reference.
- Blast job/allocation reference.
- Protected/canonical recipient reference.
- Attempt count.
- Last attempt time.
- Message/provider identifier if available.
- Worker identifier.
- Lock time.
- Lease expiry or heartbeat time.
- Sent time.
- Safe failure category/reason.
- Idempotency key.
- Timestamps.

Integrity requirements:

- Enforce a unique constraint preventing same normalized phone number from being created twice for the same campaign.
- Claim recipients atomically.
- On MySQL 8, use transactions and row-level locking, such as `SELECT ... FOR UPDATE SKIP LOCKED`, for batch recipient claiming where compatible.
- Never query pending rows and update them later without atomic condition/locking.
- Record worker ownership and lease information when claiming.
- Before sending, verify campaign is ACTIVE, job is RUNNING, user remains active, device is CONNECTED, and recipient lease belongs to current worker.
- After a confirmed send result, transition to SENT atomically only if expected state/lease remains valid.
- If result storage conflicts after attempted send, do not send again; create reconciliation event.
- Retry only clearly retryable failures.
- Use configurable retry limit and exponential backoff.
- After retry limit, mark FAILED and require a controlled, audited ADMIN retry flow for additional attempts.
- Reclaim stale locks only after lease expiration and safety checks.
- Renew lease/heartbeat for long-running processing.
- Campaign/job completion must be based on authoritative aggregate recipient states.
- Mark job/campaign PARTIAL_FAILED if FAILED, UNKNOWN, or reconciliation-required recipients remain.
- Provide progress counts for sent, failed, pending, claimed/sending, cancelled, and reconciliation-required recipients.

## 13. Queue and Worker Rules

- Use BullMQ with Redis for all long-running or retryable work.
- Never perform a long delivery loop inside an HTTP request, server action, route handler, React component, or browser.
- Run queue workers separately from the Next.js web process in production.
- Queue operations include target import, recipient allocation, delivery, retry, reconciliation, stale-lock cleanup, log cleanup, notifications, and monitoring.
- Use deterministic job IDs/idempotency keys where necessary.
- Prevent duplicate queue jobs after rapid client clicks or retries.
- Configure concurrency conservatively based on server resources, device capacity, and load testing.
- Apply throttling per USER, device, campaign, blast job, and provider constraints.
- Enforce speeds 1, 3, 6, or 10 seconds only on the server.
- Never trust client-provided delay.
- Before batches and sends, verify current campaign, user, device, and job state.
- Use clear retry categories. Do not retry all errors blindly.
- Provide dead-letter/review behavior for exhausted jobs.
- Run periodic stale lock release, recovery, reconciliation, and cleanup jobs.
- On worker startup, inspect incomplete jobs and expired locks for safe recovery.
- Expose secure health checks/metrics for web, worker, database, and Redis.
- Admin may see queue health: waiting, active, completed, failed, delayed, and stalled.

## 14. Earnings, Balance, and Ledger

- User earnings are recorded only for recipients confirmed as SENT.
- Do not pay for queued, pending, attempted, failed, cancelled, skipped, unknown, or unconfirmed delivery.
- Use an immutable transaction ledger.
- Do not rely solely on updating a balance column.
- Each ledger entry must include user reference, transaction type, signed amount, currency, source type, source ID, idempotency key, status, timestamp, and minimal safe metadata.
- Enforce unique idempotency key for earning associated with each successfully sent recipient.
- One successful recipient must create only one earning record.
- Snapshot payout value when blast job/recipient allocation is created so later setting changes do not alter historical earnings.
- Calculate withdrawable balance from eligible/settled ledger data.
- Use transactions for safe recipient success and ledger insertion where possible.
- Use Decimal-safe database types/calculations for all monetary values.
- Never use JavaScript float arithmetic for money, fee, balance, payout, or withdrawal.
- Admin adjustments must always have a reason, admin actor reference, ledger entry, and audit trail.

## 15. Wallet and Withdrawal

Wallet setup:

- USER may set wallet once.
- Required fields: full legal name, selected bank/e-wallet provider, account number/e-wallet number.
- Encrypt sensitive wallet fields at rest.
- Mask wallet data in all UI.
- Do not allow direct changes after setup without controlled change-request/review policy.
- Record wallet setup/change decisions in audit logs.

Withdrawal:

- USER may request withdrawal only when available balance satisfies admin-configured minimum.
- Protect withdrawal request with Turnstile and optionally password confirmation/re-authentication.
- Rate-limit withdrawal requests.
- Withdrawal states:
  - PENDING
  - PROCESSING
  - APPROVED
  - PAID
  - REJECTED
  - CANCELLED
- When request is created, atomically reserve/hold funds in the ledger.
- Prevent withdrawing same balance twice.
- On reject/cancel, create ledger release/reversal.
- ADMIN actions must include safe notes/reasons where relevant and audit records.
- Do not represent manual payout as automatic payout.
- Add payout provider only after verified provider integration and secure webhook/reconciliation support.

## 16. Logging, Audit, and Retention

Maintain separate categories:

- Operational logs.
- Security logs.
- Delivery logs.
- Queue/worker logs.
- Admin audit logs.

Rules:

- Never write password, password hash, QR content, pair code, device credential, API secret, full target number list, or full wallet account number into logs.
- Delivery logs must use sanitized recipient references.
- Use structured logs where possible: request ID, job ID, campaign ID, blast job ID, user ID, device ID, event, safe status, and timestamp.
- Admin audit logs must capture actor, action, resource, safe before/after summary, reason, and timestamp.
- Admin actions affecting users, devices, campaign, target list, money, withdrawal, settings, or exports must be audited.
- Make delivery-log retention configurable, such as 7, 14, or 30 days.
- Cleanup must run on the server/worker scheduler, not just be hidden in UI.
- Cleanup must be chunked/batched, idempotent, monitored, and safe for database resources.
- Preserve security/audit logs based on explicit retention policy.
- Do not expose internal worker errors or raw stack traces to end users.

## 17. Admin Settings

All settings must be validated with schema, stored safely, audited on change, and cached safely.

Settings include:

- General: app name, logo, favicon, metadata, timezone, support contact.
- Registration: enabled/disabled, policy text, default role.
- Authentication: session duration, password rules, login rate limits.
- Turnstile: public site key client-side; secret only server-side.
- Blast: enabled speeds, job limits, device limits, campaign quota, retry policy, file size, max target upload, default country code, rate limits.
- Earnings: default payout per confirmed successful send and settlement policy.
- Withdrawal: minimum amount, fee, allowed payout providers, approval workflow.
- Device: device inactivity, reconnection, QR/pair request limits.
- Pair code: UI/reference policy only within actual integration/provider capabilities.
- Maintenance: maintenance state, announcement content, schedule.
- Retention: log retention, target-upload retention, inactive device cleanup, archived campaign retention.

Any setting that can affect an active blast job must be snapshotted for existing jobs or applied only to future jobs.

## 18. Premium UI/UX Rules

Build a responsive, accessible, high-performance premium interface.

General visual direction:

- Modern, polished, clean, spacious, and business-grade.
- Mobile-first responsive design.
- Strong visual hierarchy.
- Inter or Plus Jakarta Sans typography.
- Light and dark mode.
- Semantic colorful icons.
- Subtle gradients and shadows; do not overuse visual effects.
- Accessible color contrast at WCAG AA minimum.

Color direction:

- Primary: blue to purple gradient.
- Secondary: teal to cyan gradient.
- Success/earnings/completed: green to emerald.
- Warning/pending: yellow to orange.
- Error/destructive: red to rose.
- Base neutral: slate/grays.

Icons:

- Use Lucide React as default.
- Use colored icons for navigation, quick action cards, dashboard stats, status badges, device states, campaign states, earnings, withdrawal, and empty states.
- Use green for success, completed, connected, and earnings.
- Use blue/purple for navigation and primary actions.
- Use yellow/orange for pending and warning.
- Use red/rose for failed/error/destructive actions.
- Use teal/cyan for secondary/info actions.
- Keep icon style consistent.
- Add accessible labels/tooltips for icon-only controls.

Animation:

- Use Framer Motion.
- Micro-interactions: around 150ms.
- Standard UI transitions: around 250ms to 350ms.
- Major modal/page entrance: around 400ms to 600ms only where beneficial.
- Prefer `transform` and `opacity`.
- Avoid animation patterns that cause layout thrashing.
- Respect `prefers-reduced-motion`.
- Use fade/slide-up for section/card entry.
- Use gentle stagger for lists/grids.
- Use scale/shadow feedback for buttons and cards.
- Use press feedback for button click/tap.
- Use skeleton/shimmer during loading.
- Use small success bounce/check animation and limited error shake.
- Use pulse for active/live statuses only.
- Do not use distracting or CPU-heavy continuous animation.

Responsive requirements:

- Minimum touch target is 44 by 44 pixels.
- Sidebar should collapse on desktop and become a drawer on mobile.
- Tables must have a mobile-safe representation: cards, detail drawers, or controlled horizontal scroll.
- Use responsive layouts for admin dashboards, campaign cards, device cards, progress widgets, forms, and logs.
- Do not hide critical actions on mobile.
- Every async action needs loading, success, error, disabled, and empty states.
- Destructive actions require confirmation modal.
- Use server-confirmed UI state for security, money, campaign, device, and blast-job operations.
- Do not show sensitive target/device/wallet details in UI beyond allowed role and masking rules.

User UI must provide:

- Dashboard overview.
- Device management.
- Available campaigns.
- Blast-job start/monitor/history.
- Earnings and ledger history.
- Withdrawal and wallet status.
- Password change.
- Announcements/support if enabled.

Admin UI must provide:

- Dashboard metrics.
- User management.
- Device monitoring.
- Target list upload/management.
- Campaign management.
- Blast job monitoring.
- Earnings ledger.
- Withdrawal management.
- Logs and audit.
- Site/security/blast/device/settings.
- Maintenance/announcement.
- Queue/worker health.

## 19. API and Server Rules

- Use server actions for internal UI mutations when appropriate.
- Use route handlers for file uploads, streaming progress, webhooks, and external integration.
- Every mutation requires server-side session validation, role validation, ownership validation, Zod validation, and rate-limit check where needed.
- Use consistent safe error responses.
- Never expose stack traces to browser.
- Use server-side pagination, filtering, and allowlisted sorting for large datasets.
- Do not fetch all users, targets, recipients, logs, or jobs into browser.
- Use secure polling, SSE, or WebSocket for job progress only after authorization validation.
- State transitions for campaign, job, device, recipient, ledger, and withdrawal must be validated server-side.
- Use confirmation UI plus audit logging for sensitive/destructive actions.
- Do not accept business-critical calculated values from client; compute them server-side.

## 20. Database Rules

- Use Prisma migrations in production. Do not use `prisma db push` for production deployment.
- Use UTC timestamps in database.
- Convert to user timezone only in presentation.
- Use Decimal types for all financial amounts.
- Add indexes for IDs/foreign keys, status, timestamps, user, campaign, blast job, target list, device, recipient state, and common filtering combinations.
- Add unique constraints for:
  - Email.
  - Settings keys.
  - Ledger idempotency keys.
  - Target-list plus normalized phone number.
  - Campaign recipient identity.
  - Any operation vulnerable to duplicate creation.
- Use database transactions for:
  - Device limit enforcement.
  - Campaign activation.
  - Blast-job creation.
  - Recipient claim.
  - Recipient SENT and earnings-ledger entry.
  - Withdrawal hold.
  - Withdrawal release/reversal.
  - Balance adjustment.
- Never keep a database transaction open while waiting on an external WhatsApp send/network call.
- Use pre-send and post-send states designed for idempotency and reconciliation.
- Prefer archive/soft delete for records with audit, delivery, financial, or historical importance.
- Encrypt sensitive stored credentials.
- Use private object storage/private volume references for large files and device sessions when appropriate.

## 21. Monitoring and Operations

- Provide secure health checks for web application, worker, database, and Redis.
- Use structured logging.
- Monitor queue backlog, stalled jobs, failed jobs, worker availability, CPU, RAM, disk, database pool, Redis health, and device connection failures.
- Alert ADMIN/operator for stuck campaign, stuck blast job, high failure rate, abnormal device disconnects, pending withdrawal backlog, import failures, cleanup failures, and queue outages.
- Never put full payloads or full target lists into production logs.
- Provide admin-only operations view with queue health and sanitized failure summaries.
- Keep web process and worker process independently deployable/restartable.
- Ensure server restart/redeploy cannot silently lose claimed recipients or duplicate delivery.

## 22. Testing Rules

Every major feature requires relevant test coverage.

Minimum tests:

- Unit tests:
  - Zod validators.
  - International phone normalization.
  - RBAC permissions.
  - Ownership checks.
  - State transitions.
  - Ledger calculation/idempotency.
  - Target parsers.
  - Settings validation.
- Integration tests:
  - Credentials login.
  - Admin/user redirect.
  - Turnstile mock verification.
  - User suspension.
  - Device maximum limit.
  - Target import.
  - Campaign create/assignment/activation.
  - User blast-job creation.
  - Recipient claiming.
  - Retry/recovery.
  - Stale lock handling.
  - Earnings ledger creation.
  - Wallet setup.
  - Withdrawal hold/release.
  - Admin withdrawal action.
- E2E tests:
  - Admin authentication and route access.
  - User authentication and route access.
  - Responsive device connection UI.
  - Admin target upload.
  - Admin campaign workflow.
  - User available-campaign flow.
  - User blast-job start/stop.
  - Authorized progress display.
  - Password change.
  - Wallet setup.
  - Withdrawal flow.
- Concurrency tests:
  - Multiple workers cannot claim same recipient.
  - Duplicate client start request does not create duplicate blast job.
- Recovery tests:
  - Worker crash/restart.
  - Lease expiration.
  - Stale lock reclaim.
  - No blind resend on ambiguous delivery.
- Financial tests:
  - One confirmed recipient creates exactly one earning.
  - Withdrawal cannot reserve same funds twice.
- Load tests:
  - Non-production, consented/test data only.
  - At least 10,000, 50,000, and 100,000 targets.
- Before completion, run npm lint, typecheck, relevant tests, and production build.

## 23. Definition of Done

Do not mark a feature complete unless:

- UI is responsive, accessible, and polished.
- Loading, success, error, empty, and disabled states are present.
- Client and server validation are in place.
- Authentication, RBAC, and ownership validation are enforced.
- Sensitive data is protected.
- Errors are safe for users.
- Database migrations, indexes, constraints, and transactions are addressed.
- Large/long-running work uses queue/worker.
- Delivery and earnings logic are idempotent.
- Logging and audit requirements are implemented.
- Relevant test coverage passes.
- `npm run lint`, typecheck, tests, and `npm run build` pass where applicable.
- Documentation/project memory has been updated.

## 24. Hard Prohibitions

- Do not let USER create, edit, delete, schedule, pause, resume, archive, or control campaigns.
- Do not let USER upload, inspect, export, download, or access raw target numbers.
- Do not enable message sending without recipient consent or legitimate transactional/service basis.
- Do not build policy-bypass, anti-spam bypass, CAPTCHA bypass, rate-limit bypass, or account-protection bypass capabilities.
- Do not store secrets, passwords, QR payloads, pair codes, device sessions, API keys, or wallet details in public/client/logged form.
- Do not automatically resend ambiguous delivery states.
- Do not update user balance without an immutable ledger entry and idempotency key.
- Do not use JavaScript floating-point arithmetic for financial data.
- Do not process huge target lists in browser memory, inside a request lifecycle, or through unbounded arrays.
- Do not rely on UI-only permission checks.
- Do not rely only on mutable counters for delivery progress.
- Do not hard-delete financial, audit, delivery, or withdrawal history without an explicit retention/archive policy.
- Do not use `npm --force` or `npm --legacy-peer-deps` as the standard way to bypass dependency conflicts.
- Do not use pnpm, yarn, or bun in this project.
