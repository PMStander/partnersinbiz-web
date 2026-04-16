---
name: email-outreach
description: >
  Send, schedule, and track transactional + marketing emails, build multi-step drip sequences,
  enroll contacts, manage unsubscribes, and track click-through on shortened links on Partners in Biz.
  Uses Resend under the hood. Use this skill whenever the user mentions anything email- or
  link-tracking-related, including: "send an email", "draft email", "email a contact", "email client",
  "schedule email", "send tomorrow", "send next week", "email queue", "scheduled emails",
  "email status", "email delivered", "opened", "bounced", "complaint", "create email sequence",
  "drip campaign", "nurture sequence", "onboarding email sequence", "welcome series",
  "enroll contact in sequence", "unenroll", "sequence step", "skip step", "pause sequence",
  "resume sequence", "shorten link", "tracked link", "short URL", "link analytics", "click stats",
  "click rate", "UTM", "merge fields", "personalize email", "email template", "Resend webhook",
  "email open rate", "email performance". If in doubt, trigger.
---

# Email Outreach — Partners in Biz Platform API

Transactional email sending (via Resend), scheduled/future email, drip sequences with step-based progression, tracked shortened links with click stats, and webhook integration for delivery events.

## Base URL & Authentication

```
https://partnersinbiz.online/api/v1
```

```
Authorization: Bearer <AI_API_KEY>
```

One public endpoint: `POST /email/webhook` — Resend delivery webhook receiver.

## Crons that drive this skill

- `/api/cron/emails` — daily 6am UTC — processes scheduled emails whose `scheduledFor <= now`
- `/api/cron/sequences` — daily 6am UTC — advances sequence enrollments to next step

## Collaboration primitives

- Email records are commentable (`resourceType` not yet in spec for emails — use the `emails` doc audit trail)
- Unsubscribes cascade: once a contact unsubscribes, all sequence enrollments pause + outbound to them is blocked

---

## API Reference

### Email — send & schedule

#### `POST /email/send` — auth: admin
Send an email immediately via Resend.

Body:
```json
{
  "to": "jane@acme.com",
  "cc": ["other@acme.com"],
  "subject": "Welcome to Partners in Biz",
  "bodyText": "Hi Jane,\n\n...\n\nCheers,\nPeet",
  "bodyHtml": "<p>Hi Jane...</p>",
  "contactId": "contact_abc",
  "sequenceId": "seq_xyz",
  "sequenceStep": 2
}
```

Required: `to`, `subject`, `bodyText` OR `bodyHtml`. If only one of bodyText/bodyHtml provided, the other is auto-generated.

Creates an `emails` doc (even on failure for audit). Links to CRM via `contactId` — auto-logs an `email_sent` activity.

Response: `{ id, resendId, status: 'sent' | 'failed' }`.

#### `POST /email/schedule` — auth: admin
Schedule an email for future send.

Body (same as `/send` plus):
```json
{ "scheduledFor": "2026-04-20T09:00:00Z" }
```

Creates `emails` doc with `status: 'scheduled'`. Cron picks it up at `scheduledFor`.

Response: `{ id, status: 'scheduled', scheduledFor }`.

#### `GET /email` — auth: admin
List emails. Filters: `status` (`draft`|`scheduled`|`sent`|`failed`), `direction` (`inbound`|`outbound`), `contactId`, `sequenceId`, `page`, `limit`.

#### `GET /email/[id]` — auth: admin
Full email record including `openedAt`, `clickedAt`, `bouncedAt`, `complaintAt`.

#### `PUT /email/[id]` — auth: admin
Update a scheduled email's content or `scheduledFor`. Rejects if `status !== 'scheduled'`.

#### `DELETE /email/[id]` — auth: admin
Cancel a scheduled email (soft-delete). Sent emails cannot be deleted — only archived.

#### `POST /email/webhook` — **public**
Resend delivery webhook receiver. Updates `emails` docs on events:
- `email.delivered`
- `email.opened` → sets `openedAt`
- `email.clicked` → sets `clickedAt`
- `email.bounced` → sets `bouncedAt`, `status: 'failed'`
- `email.complained` → sets `complaintAt`, auto-unsubscribes the contact

### Sequences (drip campaigns)

#### `GET /sequences` — auth: admin
List. Filters: `status` (`draft`|`active`|`paused`|`archived`), pagination.

#### `POST /sequences` — auth: admin
Body:
```json
{
  "name": "SaaS Onboarding",
  "description": "5-step welcome + activation",
  "status": "draft",
  "steps": [
    { "order": 1, "dayOffset": 0, "subject": "Welcome {{firstName}}",
      "bodyText": "Thanks for signing up...", "bodyHtml": "..." },
    { "order": 2, "dayOffset": 2, "subject": "Day 2: Get your first value",
      "bodyText": "...", "bodyHtml": "..." },
    { "order": 3, "dayOffset": 5, "subject": "How's it going?",
      "bodyText": "..." },
    { "order": 4, "dayOffset": 9, "subject": "Before you forget...",
      "bodyText": "..." },
    { "order": 5, "dayOffset": 14, "subject": "Your 2-week checkpoint",
      "bodyText": "..." }
  ]
}
```

Merge fields in subject/body: `{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{company}}`, `{{customField.X}}`. Resolved against the enrolled contact at send time.

Required: `name`.

Response (201): `{ id }`.

#### `GET /sequences/[id]` — auth: admin
Full sequence with steps + enrollment counts.

#### `PUT /sequences/[id]` — auth: admin
Update name, description, status, steps. Changing steps mid-flight:
- New steps beyond current max: applied to ongoing enrollments.
- Removing/modifying already-sent steps: doesn't rewrite history.

#### `DELETE /sequences/[id]` — auth: admin
Soft-delete. Pauses all active enrollments.

#### `POST /sequences/[id]/enroll` — auth: admin
Enroll a contact (or batch).

Body:
```json
{ "contactId": "contact_abc" }
```

Or batch:
```json
{ "contactIds": ["contact_a", "contact_b", "contact_c"] }
```

Creates enrollment(s) in `sequence_enrollments` with `status: 'active'`, `currentStep: 0`, `startedAt: now`. Cron advances.

Response: `{ enrolled: count, enrollmentIds: [...] }`.

### Sequence enrollments

#### `GET /sequence-enrollments` — auth: admin
Filters: `sequenceId`, `contactId`, `status` (`active`|`paused`|`completed`|`unsubscribed`|`failed`), pagination.

Response items:
```json
{ "id": "enr_abc", "sequenceId": "seq_xyz", "contactId": "contact_abc",
  "status": "active", "currentStep": 2, "startedAt": "...", "nextSendAt": "...",
  "completedAt": null, "lastEmailId": "email_xyz" }
```

#### `GET /sequence-enrollments/[id]` — auth: admin

#### `PATCH /sequence-enrollments/[id]` — auth: admin
Update `status`:
- `paused` — skips future sends
- `active` — resume from current step
- `completed` — marks finished
- `unsubscribed` — auto-cascades from email.complained

Body: `{ "status": "paused" }` or `{ "status": "active" }`.

#### `DELETE /sequence-enrollments/[id]` — auth: admin
Remove enrollment (rare — prefer status change).

### Tracked short links

#### `GET /links` — auth: client
Paginated. Filter by `orgId` (via `withTenant`, derived from user record).

Response items:
```json
{ "id": "link_abc", "orgId": "org_xyz", "slug": "promo-apr",
  "targetUrl": "https://acme.com/april-promo",
  "shortUrl": "https://partnersinbiz.online/l/promo-apr",
  "clickCount": 42, "createdAt": "..." }
```

#### `POST /links` — auth: client
Create a short link.

Body:
```json
{
  "targetUrl": "https://acme.com/landing?source=email&utm_campaign=april",
  "slug": "april-landing",
  "description": "Email CTA April campaign"
}
```

`slug` is optional — auto-generated if omitted. Must be unique per org. Short URL: `<PUBLIC_BASE_URL>/l/<slug>`.

Response (201): `{ id, slug, shortUrl }`.

#### `GET /links/[id]` — auth: client
Full link record.

#### `PUT /links/[id]` — auth: client
Update `targetUrl` or `description`. Slug cannot be changed after creation.

#### `DELETE /links/[id]` — auth: client
Soft-delete (clicks on deleted links redirect to 404).

#### `GET /links/[id]/stats` — auth: client
Detailed analytics:
```json
{ "totalClicks": 142, "uniqueClicks": 98, "topReferrers": [...],
  "topCountries": [...], "clicksByDay": [...], "clicksByHour": [...],
  "browsers": {...}, "devices": {...} }
```

Click tracking happens on the public `/l/<slug>` route (not an API endpoint) which logs + redirects.

---

## Workflow guides

### 1. Send a one-off email

```bash
POST /email/send
{ "to": "jane@acme.com", "subject": "Following up on our chat",
  "bodyText": "Hi Jane,\n\nFollowing up on...\n\nBest,\nPeet",
  "contactId": "contact_abc" }
```

### 2. Schedule a follow-up

```bash
POST /email/schedule
{ "to": "jane@acme.com", "subject": "Check-in", "bodyText": "...",
  "scheduledFor": "2026-04-22T09:00:00Z", "contactId": "contact_abc" }

# Cancel later if needed
DELETE /email/email_xyz
```

### 3. Build and launch a nurture sequence

```bash
# Draft the sequence
POST /sequences
{ "name": "SaaS Onboarding",
  "status": "draft",
  "steps": [
    { "order": 1, "dayOffset": 0, "subject": "Welcome {{firstName}}", "bodyText": "..." },
    { "order": 2, "dayOffset": 2, "subject": "Your first value", "bodyText": "..." },
    { "order": 3, "dayOffset": 5, "subject": "Case study", "bodyText": "..." }
  ] }

# Activate
PUT /sequences/seq_xyz
{ "status": "active" }

# Enroll contacts
POST /sequences/seq_xyz/enroll
{ "contactIds": ["contact_a", "contact_b"] }

# Monitor
GET /sequence-enrollments?sequenceId=seq_xyz&status=active
```

### 4. Pause a sequence for a specific contact

```bash
PATCH /sequence-enrollments/enr_abc
{ "status": "paused" }
```

### 5. Tracked link for email CTA

```bash
POST /links
{ "targetUrl": "https://acme.com/offer?utm_source=email&utm_campaign=q2",
  "slug": "q2-offer" }
# → { shortUrl: "https://partnersinbiz.online/l/q2-offer" }

# Include {shortUrl} in your sequence email body

# Later, check stats
GET /links/link_abc/stats
```

### 6. Handle bounces / complaints

Resend webhook auto-updates email records. Monitor via:
```bash
GET /email?status=failed&direction=outbound
```

A complaint auto-unsubscribes the contact — all active enrollments for that contact flip to `unsubscribed`.

## Error reference

| HTTP | Error | Fix |
|------|-------|-----|
| 400 | `to is required` / `subject is required` | Supply fields |
| 400 | `bodyText or bodyHtml is required` | At least one body |
| 400 | `scheduledFor must be in the future` | Check timestamp |
| 400 | `Slug already taken` | Pick a different slug |
| 404 | `Email not found` | Verify id |
| 409 | `Cannot edit a sent email` | Only scheduled/draft are editable |

## Agent patterns

1. **Link `contactId` on every outbound** — activity log stays clean.
2. **Test before enroll** — `POST /email/send` with the rendered content to yourself before launching a sequence.
3. **Watch the complaint rate** — a single complaint flags; 3+ in 7 days → pause outreach and investigate.
4. **Use short links for every CTA** — you get click stats automatically.
5. **Merge fields require contact data** — ensure contacts have `name`, `company`, etc. populated before enrolling.
6. **Scheduling tip** — scheduled emails run at the cron cadence (daily 6am UTC). For precise timing, send directly and use `Retry-After` for rate limits.
7. **Unsubscribe handling** — never send to a contact with `unsubscribed: true` or auto-unsubscribed via Resend complaint.
