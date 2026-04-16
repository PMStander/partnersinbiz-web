# Agent API Skills — Master Design Spec

**Date:** 2026-04-16
**Author:** Pip (with Peet)
**Status:** Draft for review

## Goal

Give AI agents full coverage of the Partners in Biz platform by:

1. **Filling 12 API gaps** — endpoints the platform currently lacks
2. **Adding collaboration primitives** — so humans and agents can work in the same system smoothly
3. **Writing 6 domain skills** — SKILL.md files an agent can load to drive the platform end-to-end, mirroring the depth of the existing `social-media-manager` skill

The finished system: an agent connected via `AI_API_KEY` can create clients, run CRM, invoice (EFT-first, PayPal-second), schedule meetings, build quotes, run drip campaigns, log time/expenses, collect form submissions, dispatch durable webhooks, and collaborate with humans via comments and a unified inbox — all through the same `/api/v1/*` surface.

## Design principles — "best system ever for humans + agents"

1. **Single source of truth** — one endpoint per action; no "internal" vs "agent" split.
2. **Symmetric identity** — an agent write and a human write record identically (`createdBy`, `createdByType: 'user'|'agent'|'system'`) so audit logs read cleanly.
3. **Idempotency first-class** — every POST that creates resources accepts `Idempotency-Key` header and dedupes for 24h.
4. **Everything is commentable** — unified comments collection; humans and agents leave context on any resource. `@mention` creates a notification.
5. **Unified inbox** — one endpoint returns everything that needs attention: unread notifications, unread mentions, assigned tasks, pending approvals, overdue invoices. Works for a human dashboard or an agent loop.
6. **Assignable anywhere** — `assignedTo: { type: 'user'|'agent', id }` on any resource that can be worked.
7. **Durable side effects** — webhooks and outbound emails hit a Firestore-backed queue with retry + replay, not fire-and-forget.
8. **Rich describe** — every resource response includes a `_meta` object with `createdByType`, `lastActor`, `canBe` (list of valid next actions) so agents don't have to guess state machines.
9. **Consistent errors** — all 4xx messages are one sentence, start with what's wrong, end with how to fix it.
10. **No surprises** — soft-delete everywhere, never hard-delete without `?force=true`.

## Conventions (baseline every subagent must follow)

### Auth wrapper

```ts
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req, user, ctx) => {
  return apiSuccess(data, 200, { total, page, limit })
})
```

- `withAuth('admin' | 'client', handler)` — AI/admin satisfy any role
- `apiSuccess(data, status?, meta?)`, `apiError(message, status?)`
- Auth via `Authorization: Bearer <AI_API_KEY>` (admin-equivalent for agents)

### Idempotency middleware (NEW — build in Phase A)

```ts
import { withIdempotency } from '@/lib/api/idempotency'

export const POST = withAuth('admin', withIdempotency(async (req, user) => {
  // ... create resource
  return apiSuccess({ id }, 201)
}))
```

- Reads `Idempotency-Key` header
- If key seen in last 24h, returns the cached response
- Stores `{ key, userId, responseBody, responseStatus, createdAt }` in `idempotency_keys` collection
- Key required for `POST` that creates billable side effects (invoices, emails, payments) — optional elsewhere

### Actor tagging (NEW — build in Phase A)

```ts
import { actorFrom } from '@/lib/api/actor'

await adminDb.collection('X').add({
  ...fields,
  ...actorFrom(user),  // { createdBy: user.uid, createdByType: 'user'|'agent'|'system' }
})
```

- `actorFrom(user)` → `{ createdBy, createdByType }` where type is `agent` if `user.role === 'ai'`, else `user`
- On updates: use `lastActorFrom(user)` → `{ updatedBy, updatedByType, updatedAt }`

### Route params

```ts
type RouteContext = { params: Promise<{ id: string }> }
const { id } = await (ctx as RouteContext).params
```

### Firestore

```ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

await adminDb.collection('X').add({
  orgId,
  ...fields,
  ...actorFrom(user),
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  deleted: false,
})
```

- Every org-scoped collection MUST include `orgId`
- Soft-delete via `deleted: true` (or `status: 'cancelled'`)
- `DELETE` with `?force=true` hard-deletes (admin only)
- Timestamps via `FieldValue.serverTimestamp()`

### Types

- Live in `lib/<domain>/types.ts`
- Import as `import type { X } from '@/lib/<domain>/types'`

### Response envelope

```json
{ "success": true, "data": { ... }, "meta": { "total": 50, "page": 1, "limit": 20 } }
{ "success": false, "error": "Human-readable message" }
```

---

## Part 1 — Collaboration primitives (NEW — Tier 0)

Ship these first so every later subsystem uses them.

### 0.1 Idempotency middleware
- `lib/api/idempotency.ts` — `withIdempotency(handler)` wrapper
- `idempotency_keys` collection, 24h TTL via Firestore TTL policy (note in `firestore-indexes.needed.md`)

### 0.2 Actor helpers
- `lib/api/actor.ts` — `actorFrom(user)`, `lastActorFrom(user)`

### 0.3 Unified comments — `/api/v1/comments`
Replaces per-resource comment subcollections going forward. Existing social-post comments keep working; new resources use this.
- Collection: `comments`
- Fields: `orgId, resourceType, resourceId, parentCommentId?, body, mentions[] (user/agent ids parsed from @mentions), attachments[] (uploaded file URLs), ...actorFrom, agentPickedUp, agentPickedUpAt, createdAt, updatedAt, deleted`
- Routes:
  - `GET /comments?resourceType=invoice&resourceId=inv_123` — list
  - `POST /comments` — create (body: `{ resourceType, resourceId, body, parentCommentId?, attachments? }`)
  - `PATCH /comments/[id]` — update body or agent pick-up (`{ agentPickedUp: true }`)
  - `DELETE /comments/[id]` — soft-delete
- `@mention` parser: `@user:<uid>` and `@agent:<name>` patterns → populate `mentions[]` → auto-create notifications for each
- Allowed `resourceType` values: `invoice`, `quote`, `contact`, `deal`, `project`, `task`, `expense`, `time_entry`, `form_submission`, `calendar_event`, `client_org`

### 0.4 Unified inbox — `/api/v1/inbox`
Aggregate view for humans AND agents.
- `GET /inbox?orgId=X&for=me|agent|all&unread=true&limit=50&cursor=Y`
- Returns items of shape: `{ id, itemType ('notification'|'mention'|'assignment'|'approval'|'overdue_invoice'|'pending_task'), resourceType, resourceId, title, body, priority, createdAt, link }`
- `POST /inbox/read` — body `{ itemIds: string[] }` marks items read
- `POST /inbox/snooze` — body `{ itemId, until: ISO }` snoozes (only for notifications + assignments)
- Different from social `/inbox` which is platform engagement — **this is workspace inbox**. Keep naming clear: social uses `/api/v1/social/inbox`, this is `/api/v1/inbox`.

### 0.5 Assignment helper
- `lib/collaboration/assignment.ts` — standard `assignedTo` shape + helper to emit a notification on assignment
- All new resources include `assignedTo?: { type: 'user'|'agent', id: string }`

---

## Part 2 — 12 Gap Endpoints

### Tier 1 — Small essentials

#### 1.1 `PATCH /api/v1/invoices/[id]/mark-paid`
Mark invoice paid, record payment detail.
- Body: `{ paidAt?: ISO, paymentMethod: 'eft'|'paypal'|'cash'|'card'|'other', reference?: string, amount?: number, proofFileId?: string }`
- Updates: `status: 'paid'`, `paidAt`, `paymentMethod`, `paymentReference`, `paidAmount`, `paymentProofFileId`
- Dispatches `invoice.paid` webhook
- Creates activity log entry
- Creates notification for invoice creator
- Auth: admin

#### 1.2 `PUT /api/v1/agent/brand/[orgId]`
Write/update brand profile (existing GET reads it).
- Body: `{ brandProfile?: { voice?, audience?, personas?, doNotDo?, examples?, tagline?, logoUrl?, ...}, brandColors?: { primary, secondary, accent, ... } }`
- Merges into `organizations/[orgId].brandProfile` and `.settings.brandColors`
- Auth: admin

#### 1.3 Contact tags filter on `/api/v1/crm/contacts`
- Extend existing GET with `?tags=a,b,c` filter (array-contains-any)
- Add `POST /crm/contacts/[id]/tags` (body: `{ add?: string[], remove?: string[] }`) for atomic tag edits
- No new collection

#### 1.4 `/api/v1/tasks` (standalone)
Personal + cross-project tasks.
- Collection: `tasks`
- Fields: `orgId, title, description, status ('todo'|'in_progress'|'done'|'cancelled'), priority ('low'|'normal'|'high'|'urgent'), dueDate, assignedTo, projectId?, contactId?, dealId?, ...actor, createdAt, updatedAt, completedAt, deleted`
- Routes:
  - `GET /tasks` — filters: `status`, `priority`, `assignedTo`, `projectId`, `contactId`, `dealId`, `dueBefore`, `dueAfter`, `tags`
  - `POST /tasks` (with idempotency)
  - `GET/PUT/DELETE /tasks/[id]`
  - `POST /tasks/[id]/complete` (sets status=done + completedAt)
  - `POST /tasks/[id]/assign` (body: `{ assignedTo: {type, id} }`)

#### 1.5 `/api/v1/notifications`
Persistent notifications feed (surfaced via `/inbox`).
- Collection: `notifications`
- Fields: `orgId, userId? (null = org-wide), agentId? (targeted at specific agent), type (string), title, body, link?, data?, priority, status ('unread'|'read'|'archived'|'snoozed'), snoozedUntil?, readAt, createdAt`
- Routes:
  - `GET /notifications` — filters: `status`, `userId`, `agentId`, `type`, `limit`, `cursor`
  - `POST /notifications`
  - `PATCH /notifications/[id]` — status/snoozedUntil
  - `POST /notifications/read-all` (body: `{ userId? }`)
  - `DELETE /notifications/[id]`

### Tier 2 — Medium

#### 2.1 `/api/v1/files`
List/search uploaded files (wrapper over `uploads` collection).
- `GET /files` — `orgId`, `type` (mime prefix), `search`, `relatedTo.type/id`, `page`, `limit`
- `GET /files/[id]`
- `DELETE /files/[id]` (soft by default)
- `POST /files` delegates to existing `/upload`; document the relationship in the skill

#### 2.2 `/api/v1/calendar/events`
Meetings + events.
- Collection: `calendar_events`
- Fields: `orgId, title, description, startAt, endAt, allDay, timezone, location, meetingUrl, attendees[] {name,email,status,userId?}, relatedTo? {type, id}, assignedTo?, reminderMinutesBefore[], recurrence? (RRULE string), ...actor, createdAt, updatedAt, deleted`
- Routes: `GET/POST /calendar/events`, `GET/PUT/DELETE /calendar/events/[id]`, `POST /calendar/events/[id]/rsvp` (attendee status update)

#### 2.3 `/api/v1/reports/*`
Read-only aggregate endpoints.
- `GET /reports/revenue` — `orgId, from, to, groupBy`
- `GET /reports/pipeline` — `orgId`
- `GET /reports/outstanding` — `orgId` (aged buckets: 0-30, 31-60, 61-90, 90+)
- `GET /reports/activity-summary` — `orgId, from, to`
- `GET /reports/client-value` — `orgId`
- `GET /reports/team-utilization` — `orgId, from, to` (pulls from time_entries, shows billable/non-billable hours per user)
- `GET /reports/expense-summary` — `orgId, from, to, groupBy=category|project|user`

### Tier 3 — Modules

#### 3.1 Time tracking — `/api/v1/time-entries`
- Collection: `time_entries`
- Fields: `orgId, userId, projectId?, taskId?, clientOrgId?, description, startAt, endAt, durationMinutes, billable, hourlyRate?, currency, invoiceId?, tags[], ...actor, createdAt, updatedAt, deleted`
- Routes:
  - `GET/POST /time-entries` (POST idempotent)
  - `GET/PUT/DELETE /time-entries/[id]`
  - `POST /time-entries/start` → creates entry `{ startAt=now, endAt=null }`
  - `POST /time-entries/[id]/stop` → sets `endAt=now`, computes duration
  - `POST /time-entries/bill` — `{ entryIds[], invoiceId }` ties entries to invoice, adds line items
  - `GET /time-entries/running` — current running timer(s) for user

#### 3.2 Expenses — `/api/v1/expenses`
- Collection: `expenses`
- Fields: `orgId, userId, date, amount, currency, category, description, vendor, receiptFileId?, projectId?, clientOrgId?, billable, reimbursable, status ('draft'|'submitted'|'approved'|'reimbursed'|'rejected'), invoiceId?, reviewedBy?, reviewedAt?, rejectionReason?, ...actor, createdAt, updatedAt, deleted`
- Routes: `GET/POST /expenses`, `GET/PUT/DELETE /expenses/[id]`, `POST /expenses/[id]/submit`, `POST /expenses/[id]/approve` (body: `{ action: 'approve'|'reject', note? }`), `POST /expenses/bill` (body: `{ expenseIds[], invoiceId }`)

#### 3.3 Forms — `/api/v1/forms` + submissions
- Collections: `forms`, `form_submissions`
- Form fields: `orgId, name, slug (unique per org), title, description, fields[] {id,type,label,required,options?,placeholder?,validation?}, thankYouMessage, notifyEmails[], redirectUrl?, createContact, active, rateLimitPerMinute, ...actor, createdAt, updatedAt, deleted`
- Submission fields: `formId, orgId, data{fieldId:value}, submittedAt, ipAddress, userAgent, status ('new'|'read'|'archived'), contactId?, source?`
- Routes:
  - `GET/POST /forms`, `GET/PUT/DELETE /forms/[id]`
  - `POST /forms/[slug]/submit` — **public**, validates + applies rate limit + dispatches `form.submitted` webhook
  - `GET /forms/[id]/submissions`, `GET/PATCH /forms/[id]/submissions/[subId]`
- Public submit endpoint: rate-limited by IP (10/min default, configurable), honeypot field `_hp` (silent reject if populated)

#### 3.4 Outbound webhooks — `/api/v1/webhooks` + durable queue

**Architecture (doing it right):**

```
dispatchWebhook(orgId, event, payload)
  └─→ writes to webhook_queue {status: 'pending', nextAttemptAt: now}

/api/cron/webhooks (every 1 min via Vercel Cron)
  └─→ claims up to N pending items (where nextAttemptAt <= now)
       ├─ marks status: 'delivering'
       ├─ POSTs to webhook.url with HMAC signature
       └─ on success: status: 'delivered', writes webhook_deliveries record
           on failure: status: 'pending' + retryCount++ + nextAttemptAt = now + backoff
                        OR status: 'failed' after max retries (6 attempts)
```

- Collection: `outbound_webhooks` — `{ orgId, name, url, events[], secret, active, failureCount, lastDeliveredAt, lastFailureAt, autoDisabledAt?, ...actor, createdAt, updatedAt, deleted }`
- Collection: `webhook_queue` — `{ webhookId, orgId, event, payload, status, retryCount, nextAttemptAt, createdAt }`
- Collection: `webhook_deliveries` — `{ webhookId, queueItemId, event, payloadHash, responseStatus, responseHeaders, responseBody (first 2KB), durationMs, attemptNumber, deliveredAt, error? }`
- Retry schedule: `[0s, 30s, 2m, 10m, 1h, 6h]` (6 attempts)
- Auto-disable webhook after 10 consecutive failures
- HMAC-SHA256 signature: `X-PIB-Signature: sha256=<hex>` over raw body with webhook secret
- Headers: `X-PIB-Event`, `X-PIB-Delivery-Id`, `X-PIB-Timestamp`, `X-PIB-Signature`
- Routes:
  - `GET/POST /webhooks`, `GET/PUT/DELETE /webhooks/[id]`
  - `POST /webhooks/[id]/test` — queues a test event synchronously
  - `POST /webhooks/[id]/enable` / `POST /webhooks/[id]/disable`
  - `GET /webhooks/[id]/deliveries?limit=20&cursor=X` — delivery history
  - `POST /webhooks/[id]/deliveries/[deliveryId]/replay` — re-queue a failed delivery
- Cron route: `/api/cron/webhooks` (add to `vercel.json` with `* * * * *`)
- Events at launch: `invoice.created`, `invoice.sent`, `invoice.paid`, `invoice.overdue`, `quote.created`, `quote.accepted`, `quote.rejected`, `contact.created`, `contact.updated`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`, `form.submitted`, `payment.received`, `expense.submitted`, `task.completed`
- `lib/webhooks/dispatch.ts` — `dispatchWebhook(orgId, event, payload)` callable from any route

#### 3.5 Payments — EFT-first, PayPal-second

**No Stripe.** South Africa — EFT is primary (cost-free for us and client), PayPal is fallback for international clients.

##### 3.5.1 EFT (primary)
- `GET /invoices/[id]/payment-instructions` — returns:
  ```json
  {
    "invoiceNumber": "CLI-001",
    "total": 1500,
    "currency": "ZAR",
    "dueDate": "2026-05-01",
    "eft": {
      "bankingDetails": { "bankName": "...", "accountName": "...", "accountNumber": "...", "branchCode": "...", "swift": "..." },
      "reference": "CLI-001",
      "proofOfPaymentEmail": "billing@partnersinbiz.online"
    },
    "paypal": {
      "available": true,
      "url": "https://api.partnersinbiz.online/api/v1/invoices/[id]/paypal-order"
    },
    "publicViewUrl": "https://partnersinbiz.online/invoice/<slug>"
  }
  ```
- Bank details come from platform owner org `billingDetails.bankingDetails` (already exists)
- `POST /invoices/[id]/payment-proof` — client uploads proof of payment file
  - Body: `{ fileId, note? }` or `multipart/form-data` with `file`
  - Updates invoice `status: 'payment_pending_verification'`, `paymentProofFileId`, `paymentProofUploadedAt`
  - Creates a notification for admin
  - Returns `{ id, status }`
- `POST /invoices/[id]/confirm-payment` — admin verifies proof
  - Body: `{ confirmed: true, paymentMethod: 'eft', reference?, amount? }` or `{ confirmed: false, reason: string }`
  - If confirmed: calls `mark-paid` flow
  - If rejected: status back to `sent`, notifies client

##### 3.5.2 PayPal (secondary)
Used only when `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` env vars set.
- `POST /invoices/[id]/paypal-order` — creates PayPal order
  - Returns `{ orderId, approveUrl, provider: 'paypal' }`
  - Stores `paypalOrderId` on invoice
- `POST /invoices/[id]/paypal-capture` — called after user approves on PayPal
  - Captures the order, marks invoice paid (via mark-paid flow)
- `POST /api/v1/webhooks/paypal` — **public** PayPal webhook handler
  - Verifies PayPal signature
  - On `CHECKOUT.ORDER.APPROVED` or `PAYMENT.CAPTURE.COMPLETED`: marks invoice paid
- Public invoice view page `/invoice/[slug]` (not in this spec — skill will note it exists at frontend level) shows EFT details prominently, PayPal button as secondary.

##### 3.5.3 Invoice status machine update
Invoice statuses expand:
- `draft` → `sent` (via `POST /invoices/[id]/send`)
- `sent` → `viewed` (via public view page hit, records `viewedAt`, status stays `sent` but `viewedAt` populates)
- `sent` → `payment_pending_verification` (EFT proof uploaded)
- `payment_pending_verification` → `paid` (confirmed) or `sent` (rejected)
- `sent` → `paid` (PayPal captured or admin marks)
- `sent` → `overdue` (cron flips when past `dueDate`)
- Any → `cancelled`

New routes:
- `POST /invoices/[id]/send` — emails invoice, sets `status: 'sent'`, `sentAt`, dispatches `invoice.sent` webhook
- `POST /invoices/[id]/mark-viewed` — public-ish endpoint (requires invoice `publicToken`); increments `viewCount` + records `firstViewedAt`/`lastViewedAt`

Daily cron `/api/cron/invoices` (already exists) extended to flip unpaid past-due invoices to `overdue` + dispatch `invoice.overdue` webhook.

---

## Part 3 — 6 Skills to Write

Each skill is `partnersinbiz-web/.claude/skills/<skill-name>/SKILL.md`, matching the depth/structure of the existing `social-media-manager` skill.

### Skill 1 — `client-manager`
**Covers:** `/organizations` (all subroutes), `/clients`, `/onboarding`, `/portal/enquiries`, `/portal/messages`, `PUT /agent/brand/[orgId]`, `/comments` (for client orgs), `/notifications` (client-related types)
**Triggers:** "create a client", "new org", "invite team member", "link client to org", "client portal message", "onboard a new client", "update brand profile", "log enquiry", "client notes"

### Skill 2 — `crm-sales`
**Covers:** `/crm/contacts` (+ tags), `/crm/deals`, `/crm/activities`, `/quotes`, `/ai/contact-brief`, `/forms` + submissions, `/comments` (contact/deal), `/tasks` (contact/deal-linked), `/calendar/events` (meetings with contacts)
**Triggers:** "add a contact", "new lead", "tag contact", "move deal to stage", "draft a quote", "send proposal", "log a call", "brief me on this contact", "create a form", "review form submissions", "schedule meeting with contact"

### Skill 3 — `billing-finance`
**Covers:** `/invoices` (all — CRUD, preview, PDF, duplicate, recurring, send, mark-paid, payment-instructions, payment-proof, confirm-payment, paypal-order, paypal-capture), `/invoices/next-number`, `/recurring-schedules`, `/expenses`, `/reports/revenue`, `/reports/outstanding`, `/reports/client-value`, `/reports/expense-summary`, `/comments` (invoice/expense)
**Triggers:** "create an invoice", "send invoice", "EFT payment", "mark paid", "generate PDF", "payment link", "payment instructions", "proof of payment", "PayPal invoice", "recurring invoice", "log expense", "submit expense report", "revenue report", "outstanding invoices", "overdue"

### Skill 4 — `project-management`
**Covers:** `/projects`, `/projects/[id]/tasks` (+ comments), `/projects/[id]/docs`, `/agent/project/[id]`, `/tasks` (standalone), `/time-entries`, `/calendar/events`, `/comments` (project/task), `/reports/team-utilization`
**Triggers:** "create a project", "add a task", "personal todo", "project status", "project doc", "project brief", "start timer", "log time", "stop timer", "bill time to invoice", "schedule a meeting", "calendar event", "team utilization"

### Skill 5 — `email-outreach`
**Covers:** `/email` (send, schedule, CRUD), `/sequences`, `/sequence-enrollments`, `/links` (+ stats)
**Triggers:** "send an email", "schedule email", "drip campaign", "email sequence", "enroll in sequence", "track link", "shorten link", "email analytics", "unsubscribe contact"

### Skill 6 — `platform-ops`
**Covers:** `/platform/api-keys`, `/search`, `/dashboard/*`, `/activity`, `/upload`, `/files`, `/health`, `/inbox` (unified), `/notifications`, `/agent/inbox`, `/agent` manifest, `/webhooks` (+ deliveries + replay), `/reports/activity-summary`, `/reports/pipeline`, `/comments` (cross-cutting)
**Triggers:** "dashboard stats", "search everything", "api key", "upload a file", "list files", "activity log", "platform health", "inbox", "notifications", "assigned to me", "outbound webhook", "test webhook", "replay webhook delivery", "webhook history"

---

## Execution Plan (parallel subagents)

### Phase A — Collaboration primitives + gap endpoints (13 parallel agents)

All receive the conventions + principles sections of this spec + their specific subsection(s) + instruction to emit `firestore-indexes.needed.md` additions for any new composite filters.

| Agent | Deliverables |
|-------|--------------|
| `A0-primitives` | 0.1 idempotency, 0.2 actor helpers (**priority — other agents depend on these**) |
| `A1-tier1-small` | 1.1 mark-paid, 1.2 brand PUT, 1.3 contact tags filter + POST /tags |
| `A2-tasks` | 1.4 standalone tasks |
| `A3-notifications-inbox` | 1.5 notifications + 0.4 unified inbox |
| `A4-comments` | 0.3 unified comments + @mention parser |
| `A5-files-calendar` | 2.1 files, 2.2 calendar events |
| `A6-reports` | 2.3 reports (all 7) |
| `A7-time-tracking` | 3.1 time-entries |
| `A8-expenses` | 3.2 expenses |
| `A9-forms` | 3.3 forms + submissions + public submit + rate limit |
| `A10-webhooks` | 3.4 webhooks + queue + cron worker + replay |
| `A11-payments` | 3.5 EFT + PayPal + payment-proof + invoice status machine + /send + /mark-viewed + overdue cron update |
| `A12-dispatch-wiring` | Wire `dispatchWebhook` calls into existing routes (invoice POST, quotes PUT, contacts POST, deals PUT, forms submit, tasks complete, expense submit). Depends on A10. |

**Dependency order:**
- `A0-primitives` must finish first (others use `actorFrom` + `withIdempotency`)
- `A12-dispatch-wiring` runs after `A10-webhooks`
- Everything else parallel after A0

### Phase B — Skill writing (6 parallel agents, after Phase A)

Each receives: full conventions, principles, reference to `social-media-manager/SKILL.md` as exemplar, list of routes its skill covers (with file paths).

| Agent | Skill |
|-------|-------|
| `B1` | client-manager |
| `B2` | crm-sales |
| `B3` | billing-finance |
| `B4` | project-management |
| `B5` | email-outreach |
| `B6` | platform-ops |

### Phase C — Verification

Main agent (me):
- Run `npm run typecheck` from repo root
- Spot-check each new route file compiles and uses conventions
- Spot-check each `SKILL.md` references only endpoints that actually exist
- Consolidate `firestore-indexes.needed.md`
- Update `vercel.json` to add `/api/cron/webhooks` schedule
- Write wiki article at `~/Cowork/Cowork/agents/partners/wiki/agent-api-skills.md`
- Update `hot.md` and write session log

## Out of scope

- Real PayPal SDK wiring beyond the stubs — Phase A ships the routes with `paypal-server-sdk` or `@paypal/checkout-server-sdk` integration but actual sandbox testing is a follow-up
- Firestore security rules — flagged for a hardening pass after this lands
- UI for any of this — API-only pass; UI work follows
- Recurring calendar events (RRULE parser) — field is there, full recurrence logic is follow-up
- Email deliverability proofs (SPF/DKIM/DMARC) for invoice sending — uses existing Resend path

## Risk notes

- **Firestore indexes** — many new composite filter combos. Each agent emits required indexes to `firestore-indexes.needed.md`; I consolidate in Phase C and the user deploys them.
- **Public form submit rate-limiting** — built-in per-form setting + IP-based counter in Firestore (atomic increment). Flagged: production traffic might need Cloudflare rules on top.
- **Webhook queue concurrency** — cron claims items with Firestore transaction `status: pending → delivering`. Single worker = safe. If we parallelize later, we already have a lock-via-status pattern.
- **PayPal webhook verification** — needs `PAYPAL_WEBHOOK_ID` env var; the agent building it notes this in `.env.example`.

## Success criteria

1. All gap endpoints + collaboration primitives compile (`npm run typecheck`) and follow conventions
2. All 6 SKILL.md files exist with valid YAML frontmatter and reference only endpoints that exist
3. An agent using any SKILL.md can identify the exact route, auth, params, body, response for every described operation
4. Idempotency + actor tagging + soft-delete work uniformly
5. Webhook queue delivers with retries, replays, and signs payloads
6. Invoice payment flow documents EFT-first with proof upload + admin confirm, and PayPal as secondary
7. `firestore-indexes.needed.md` lists every new index
8. `vercel.json` updated with webhook cron
9. Hot cache + session log + wiki article updated
