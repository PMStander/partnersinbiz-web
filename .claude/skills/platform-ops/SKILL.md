---
name: platform-ops
description: >
  Cross-cutting platform operations on Partners in Biz: API key management, global search,
  dashboard stats, activity feed, file uploads and library, workspace inbox (unified across all
  resources), notifications, outbound webhooks with delivery history and replay, and the agent
  manifest. Also the canonical reference for collaboration primitives (idempotency, actor tagging,
  unified comments, mentions) that all other skills use. Use this skill whenever the user mentions
  anything operational or cross-cutting, including: "dashboard stats", "platform stats",
  "global search", "search across everything", "find a doc", "find a contact", "API key",
  "create API key", "rotate key", "revoke key", "list keys", "upload a file", "file library",
  "list files", "find file", "delete file", "system health", "uptime", "platform health",
  "my inbox", "workspace inbox", "what needs my attention", "assigned to me", "pending approvals",
  "overdue items", "mentions", "mark as read", "snooze notification", "notifications",
  "mark all read", "create webhook", "outbound webhook", "subscribe to events", "HMAC verify",
  "webhook delivery", "webhook history", "test webhook", "replay failed webhook", "disable webhook",
  "agent manifest", "what can the agent do", "leave a comment", "@mention teammate",
  "activity feed", "audit log", "recent activity". If in doubt, trigger.
---

# Platform Ops — Partners in Biz Platform API

Cross-cutting platform operations, plus the canonical reference for the collaboration primitives every other skill uses.

## Base URL & Authentication

```
https://partnersinbiz.online/api/v1
```

```
Authorization: Bearer <AI_API_KEY>
```

The `AI_API_KEY` env var contains the platform-wide agent key. Alternatively, per-agent `api_keys` can be created via this skill for granular revocation.

## Collaboration primitives (canonical reference)

Every resource across all skills follows these primitives:

### Actor tagging

Every create/update records:
```json
{ "createdBy": "uid_or_agent_id", "createdByType": "user" | "agent" | "system",
  "updatedBy": "...", "updatedByType": "...", "updatedAt": "..." }
```

Agents and humans leave symmetric audit trails. `system` is reserved for cron-originated writes.

### Idempotency keys

Pass `Idempotency-Key: <uuid>` header on any `POST` that creates billable/notifiable resources. Same key replays the cached response for 24h.

Required for: `POST /invoices`, `POST /expenses`, `POST /quotes`, `POST /email/send`, `POST /tasks`, `POST /time-entries`, `POST /calendar/events`, `POST /forms`, `POST /organizations`, `POST /webhooks`.

Optional (but supported) everywhere else.

### Unified comments

Leave notes on any resource. Supported `resourceType`:
- `invoice`, `quote`, `contact`, `deal`, `project`, `task`
- `expense`, `time_entry`, `form_submission`, `calendar_event`, `client_org`

```json
POST /comments
{ "orgId": "org_abc", "resourceType": "invoice", "resourceId": "inv_xyz",
  "body": "Client wants to extend due date. @user:uid123 please review.",
  "parentCommentId": null, "attachments": ["file_abc"] }
```

`@user:<uid>` and `@agent:<id>` in body auto-create mention notifications. A denormalised `mentionIds: string[]` field on each comment enables fast inbox lookups.

### Unified workspace inbox

**Not the same as `/api/v1/social/inbox`** (which is social engagement).

The workspace inbox aggregates everything needing attention — notifications, mentions, assignments, pending approvals, overdue invoices — in one endpoint.

### Assignments

`assignedTo: { type: 'user' | 'agent', id }` works on tasks and calendar events. Creates a notification on assignment.

### Notifications

First-class notification feed. Types include: `task.assigned`, `invoice.paid`, `invoice.overdue`, `mention`, `form.submitted`, `expense.submitted`, `expense.approved`, `expense.rejected`, `member.invited`, `brand.updated`, `contact.created`, `deal.stage_changed`.

---

## API Reference

### Platform API keys

#### `GET /platform/api-keys` — auth: admin
List keys (hashes not returned; only `keyPrefix`).

#### `POST /platform/api-keys` — auth: admin
Body:
```json
{ "name": "Hermes production agent", "role": "agent", "orgId": "org_abc",
  "expiresAt": "2027-01-01" }
```

`role`: `admin` (prefix `pib_ak_`) or `agent` (prefix `pib_ag_`). Returns the raw key **once** in `keyOnce` — store it immediately. Subsequent GETs only show `keyPrefix`.

Response (201): `{ id, keyOnce, keyPrefix }`.

#### `GET/PUT/DELETE /platform/api-keys/[id]` — auth: admin
`DELETE` revokes.

### Global search

#### `GET /search?q=...` — auth: admin
Query: `q` (min 2 chars), `limit` (default 5, max 20).

Searches across: `contacts`, `projects`, `tasks`, `invoices`.

Response:
```json
[ { "id": "...", "type": "contact" | "project" | "task" | "invoice",
    "title": "...", "subtitle": "...", "url": "/admin/..." } ]
```

### Dashboard

#### `GET /dashboard/stats` — auth: admin
Top-line metrics:
```json
{ "contacts": { "total": 142 },
  "deals": { "total": 23, "pipelineValue": 120000, "wonValue": 45000 },
  "email": { "sent": 312, "opened": 180 },
  "sequences": { "active": 4, "activeEnrollments": 67 } }
```

#### `GET /dashboard/email-stats` — auth: admin
Email-specific metrics: sent, delivered, opened, clicked, bounced over last 30 days.

#### `GET /dashboard/activity` — auth: admin
Recent activity feed for dashboard widgets.

### Activity feed

#### `GET /activity` — auth: admin
Full activity feed (audit log). Filters: `orgId`, `type`, `resourceType`, `resourceId`, `from`, `to`, `page`, `limit`.

### Files

#### `POST /upload` — auth: admin
**multipart/form-data** with fields:
- `file` (required)
- `folder` (default `uploads`)
- `orgId`
- `relatedToType` + `relatedToId` (for linking)

Saves to Firebase Storage + writes metadata doc to `uploads` collection.

Response: `{ id, url, name, mimeType, size }`.

#### `GET /files` — auth: admin
List uploaded files. Filters: `orgId` (required), `type` (mime prefix, e.g. `image/`), `search` (filename contains), `relatedToType`, `relatedToId`, `page`, `limit`.

#### `GET /files/[id]` — auth: admin
Metadata including `url`, `mimeType`, `size`, `relatedTo`.

#### `DELETE /files/[id]` — auth: admin
Soft-delete (metadata). `?force=true` hard-deletes the Firestore doc (storage blob is NOT deleted — delete manually if needed).

### Health

#### `GET /health` — auth: admin
```json
{ "ok": true, "timestamp": "...", "services": { "firestore": "ok", "auth": "ok", "storage": "ok" } }
```

### Workspace inbox

#### `GET /inbox` — auth: admin
Unified inbox aggregating:
- `notification` items (from `notifications`)
- `mention` items (from `comments` where `mentionIds` contains current user/agent)
- `assignment` items (tasks assigned to current user/agent, status `todo`|`in_progress`)
- `approval` items (expenses `status=submitted`, social posts `status=pending_approval`)
- `overdue_invoice` items (invoices `status=overdue`)

Query: `orgId` (required), `for` (`me`|`agent`|`all`, default `me`), `unread` (default `true`), `limit` (default 50, max 200), `cursor` (ISO timestamp for keyset pagination).

Response:
```json
{ "items": [
    { "id": "inbox_X", "itemType": "mention", "resourceType": "invoice", "resourceId": "inv_xyz",
      "title": "Pip mentioned you", "body": "Client wants to extend due date...",
      "priority": "normal", "link": "/admin/invoices/inv_xyz", "createdAt": "..." }
  ],
  "nextCursor": "2026-04-15T09:00:00Z" }
```

#### `POST /inbox/read` — auth: admin
Body: `{ itemIds: string[] }`. Marks notification items read. Non-notification items are marked read by interacting with their resource.

Response: `{ marked: count }`.

#### `POST /inbox/snooze` — auth: admin
Body: `{ itemId, until: ISO }`. Only for notifications.

### Notifications

#### `GET /notifications` — auth: admin
Filters: `orgId` (required), `status` (default `unread`), `userId`, `agentId`, `type`, `limit`, `cursor`.

Item shape:
```json
{ "id": "...", "orgId": "...", "userId": "uid_or_null", "agentId": "aid_or_null",
  "type": "task.assigned", "title": "...", "body": "...", "link": "/admin/tasks/...",
  "data": {...}, "priority": "normal", "status": "unread",
  "snoozedUntil": null, "readAt": null, "createdAt": "..." }
```

#### `POST /notifications` — auth: admin
Body: notification fields. Required: `orgId`, `type`, `title`. At least one of `userId`/`agentId` (or both null for org-wide).

#### `GET/PATCH/DELETE /notifications/[id]` — auth: admin
PATCH updatable: `status`, `snoozedUntil`, `priority`. `status='read'` sets `readAt`.

#### `POST /notifications/read-all` — auth: admin
Body: `{ userId?, agentId?, orgId }`. Marks all unread for that recipient read.

### Outbound webhooks (durable queue)

#### Architecture overview

```
your-api-call → dispatchWebhook() → writes to webhook_queue
                                          │
                                   (every 1 min Vercel cron)
                                          ↓
                                   processPendingWebhooks()
                                          │
                                   POSTs to webhook.url with HMAC signature
                                          │
                                   on success → webhook_deliveries (audit)
                                   on failure → retry with backoff [0s, 30s, 2m, 10m, 1h, 6h]
                                                 max 6 attempts; auto-disable after 10 failures
```

#### `GET /webhooks` — auth: admin
Filters: `orgId` (required), `active`, pagination. Secret is redacted as `***`.

#### `POST /webhooks` — auth: admin (idempotent)
Body:
```json
{
  "orgId": "org_abc",
  "name": "Slack notifier",
  "url": "https://hooks.slack.com/...",
  "events": ["invoice.paid", "deal.won", "form.submitted"],
  "secret": "<optional — auto-generated if omitted>"
}
```

URL must be `https://` in production (dev can allow http via env). Events must be from the allowed list (see below).

Response (201): `{ id, secretOnce, secret: '***' }`. **`secretOnce` is only returned on create** — store it immediately.

#### `GET/PUT/DELETE /webhooks/[id]` — auth: admin
PUT updatable: `name`, `url`, `events`, `active`. See `/rotate-secret` for secret rotation.
DELETE soft-deletes.

#### `POST /webhooks/[id]/rotate-secret` — auth: admin
Rotates the HMAC secret. Returns the new secret once in `secretOnce` — store it immediately. All future deliveries sign with the new secret, so update consumer verification code **before** rotating.

Response (201): `{ id, secretOnce: "new_secret_hex", secret: "***" }`.

#### `POST /webhooks/[id]/test` — auth: admin
Queues a test event bypassing subscription filter. Returns `{ queued: true, queueItemId }`.

#### `POST /webhooks/[id]/enable` / `POST /webhooks/[id]/disable` — auth: admin
Manual enable/disable. Enable clears `autoDisabledAt` + `failureCount`.

#### `GET /webhooks/[id]/deliveries` — auth: admin
Query: `limit` (default 20, max 100), `cursor` (doc id). Sorted `deliveredAt desc`.

Delivery shape:
```json
{ "id": "dl_abc", "webhookId": "wh_xyz", "queueItemId": "wq_abc", "event": "invoice.paid",
  "payloadHash": "sha256...", "responseStatus": 200, "responseHeaders": {...},
  "responseBody": "ok (truncated 2KB)", "durationMs": 142, "attemptNumber": 1,
  "deliveredAt": "...", "error": null }
```

#### `POST /webhooks/[id]/deliveries/[deliveryId]/replay` — auth: admin
Re-queues a fresh `webhook_queue` item copying the original event + payload. Original record untouched.

#### `GET /webhooks/queue-stats` — auth: admin
Global observability snapshot. Optional `?orgId=X` scope. Returns:
```json
{ "byStatus": { "pending": N, "delivering": N, "failed": N, "deliveredLast24h": N },
  "oldestPendingAgeSeconds": N | null,
  "stuckDeliveringCount": N,
  "webhooks": { "total": N, "active": N, "autoDisabled": N },
  "timestamp": "ISO" }
```

`stuckDeliveringCount` = items claimed more than 5 minutes ago and still in `delivering`. Non-zero means a worker died mid-flight — investigate.

#### `GET /webhooks/[id]/queue` — auth: admin
Queue items for a specific webhook (debug view).

Query: `status` (pending|delivering|delivered|failed), `limit` (default 20, max 100), `cursor` (doc id from previous page).

Response: `{ items: [...], nextCursor: string | null }`.

#### Webhook event reference

| Event | Payload fields |
|-------|----------------|
| `invoice.created` | `id, invoiceNumber, total, currency, clientOrgId, dueDate` |
| `invoice.sent` | `id, invoiceNumber, total, currency, clientEmail, dueDate, publicViewUrl` |
| `invoice.paid` | `id, invoiceNumber, total, paymentMethod, paymentReference, paidAmount` |
| `invoice.overdue` | `id, invoiceNumber, total, dueDate, daysOverdue` |
| `quote.created` | `id, quoteNumber, total, currency, clientOrgId` |
| `quote.accepted` / `quote.rejected` | `id, quoteNumber, clientOrgId` |
| `contact.created` / `contact.updated` | `id, name, email, company, source` (orgId in metadata) |
| `deal.created` | `id, title, value, stage, contactId` |
| `deal.stage_changed` | `id, fromStage, toStage, value` |
| `deal.won` / `deal.lost` | `id, value, contactId` |
| `form.submitted` | `formId, slug, submissionId, contactId, data` |
| `payment.received` | `invoiceId, invoiceNumber, amount, paymentMethod, reference` |
| `expense.submitted` | `id, amount, currency, category, userId, submittedBy` |
| `task.completed` | `id, title, projectId, completedBy` |

#### Webhook signature verification (consumer code)

Every request includes:
- `X-PIB-Event` — event name
- `X-PIB-Delivery-Id` — unique delivery id
- `X-PIB-Timestamp` — ms since epoch
- `X-PIB-Signature` — `sha256=<hex>` HMAC of `${timestamp}.${rawBody}` using webhook secret

Node verifier:
```js
import crypto from 'crypto'

function verifyWebhook(req, rawBody, secret) {
  const timestamp = req.headers['x-pib-timestamp']
  const signature = req.headers['x-pib-signature']
  if (!timestamp || !signature) return false

  // Reject if timestamp is more than 5 min old (replay protection)
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return false

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
```

### Agent manifest

#### `GET /agent` — auth: admin
Returns a manifest of agent-accessible endpoints with examples. Use this to discover capabilities programmatically.

#### `GET /agent/inbox` — auth: admin
Legacy agent-specific inbox — superseded by `/inbox` for new work.

### Reports (cross-cutting)

#### `GET /reports/activity-summary?orgId=X&from=...&to=...` — auth: admin
Cross-module counts: social posts, emails sent, invoices created, deals updated, contacts added, tasks completed.

#### `GET /reports/pipeline?orgId=X` — auth: admin
Deals by stage + values + win rate.

### Comments (full reference)

Listed in "Collaboration primitives" above. Full API:

#### `GET /comments?orgId=X&resourceType=...&resourceId=...` — auth: admin
Sorted `createdAt asc`. Default limit 100. `?includeDeleted=true` to include soft-deleted.

#### `POST /comments` — auth: admin
Creates + parses mentions + notifies mentioned users/agents (async). Response: `{ id, mentions }`.

#### `GET/PATCH/DELETE /comments/[id]` — auth: admin
PATCH: update `body` (re-parses mentions but **does not re-notify**), toggle `agentPickedUp`, update `attachments`.
DELETE soft by default; `?force=true` hard.

---

## Workflow guides

### 1. Set up a new AI agent

```bash
# Issue a scoped API key for the agent
POST /platform/api-keys
{ "name": "Sales follow-up agent", "role": "agent", "orgId": "org_abc",
  "expiresAt": "2027-01-01" }
# → { id, keyOnce: "pib_ag_...", keyPrefix: "pib_ag_abcd" }

# Discover available endpoints
GET /agent
```

### 2. Agent daily loop

```bash
# 1. Pull my inbox
GET /inbox?orgId=org_abc&for=me&unread=true

# 2. Process each item
#    - mention → GET the resource, read context, POST a reply comment
#    - assignment → do the task, then POST /tasks/[id]/complete
#    - overdue_invoice → GET /invoices/[id], POST follow-up email

# 3. Mark handled notifications read
POST /inbox/read
{ "itemIds": ["inbox_a", "inbox_b"] }
```

### 3. Subscribe to events

```bash
# Create webhook
POST /webhooks
{ "orgId": "org_abc", "name": "Slack", "url": "https://hooks.slack.com/...",
  "events": ["deal.won", "invoice.paid", "form.submitted"] }
# → { id: "wh_xyz", secretOnce: "abc...", secret: "***" }

# Test it
POST /webhooks/wh_xyz/test

# Check delivery history
GET /webhooks/wh_xyz/deliveries

# Replay a specific failed delivery
POST /webhooks/wh_xyz/deliveries/dl_abc/replay
```

### 4. Upload + attach a file to a comment

```bash
# 1. Upload
POST /upload   (multipart: file, orgId=org_abc, relatedToType=invoice, relatedToId=inv_xyz)
# → { id: "file_abc", url: "https://..." }

# 2. Attach to a comment
POST /comments
{ "orgId": "org_abc", "resourceType": "invoice", "resourceId": "inv_xyz",
  "body": "Updated quote attached.", "attachments": ["file_abc"] }
```

### 5. Find anything via search

```bash
GET /search?q=acme
# Returns top matching contacts, projects, tasks, invoices
```

### 6. Generate weekly activity summary

```bash
GET /reports/activity-summary?orgId=org_abc&from=2026-04-07&to=2026-04-13
```

### 7. Verify a webhook delivery

On the consumer side: parse headers, verify signature, check timestamp freshness. Sample Node code above.

On sender side: check deliveries for status:
```bash
GET /webhooks/wh_xyz/deliveries?limit=50
```

## Error reference

| HTTP | Error | Fix |
|------|-------|-----|
| 400 | `q must be at least 2 characters` | Lengthen search query |
| 400 | `Idempotency-Key required` (rare) | Pass the header |
| 401 | Unauthorized | Check `AI_API_KEY` or key expiry |
| 403 | Forbidden | Key lacks org access |
| 404 | `Webhook not found` | Verify id |
| 409 | Duplicate action | Check resource state |
| 429 | Rate limited | Respect `Retry-After` header |

## Agent patterns

1. **Poll `/inbox` as your work queue** — it's the unified view. For humans this is their dashboard; for agents it's the daily loop trigger.
2. **Comment before you act** — leave a comment stating what the agent is about to do, then execute, then update the comment with the result. Humans can trust and verify.
3. **Pass `Idempotency-Key` on creates** — especially in retry loops. A UUIDv4 per logical operation is ideal.
4. **Subscribe to webhooks instead of polling** — cheaper, faster, more reliable.
5. **Use `X-PIB-Timestamp` freshness check** — reject webhook payloads older than 5 minutes.
6. **Prefer soft-delete** — `DELETE` is soft by default; only use `?force=true` when you're certain.
7. **Search is eventually consistent** — freshly-created items may not appear for ~1 min.
8. **Activity log everything** — use `POST /activity` (auto-written by most routes) for a durable audit trail.
