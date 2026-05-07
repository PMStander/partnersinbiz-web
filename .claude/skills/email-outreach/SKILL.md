---
name: email-outreach
description: >
  Send, schedule, and track transactional + marketing emails, build multi-step drip sequences,
  enroll contacts, manage unsubscribes, and track click-through on shortened links on Partners in Biz.
  Also manage email campaigns (bulk sends targeting a segment or contact list) and sending domain
  verification via Resend. Uses Resend under the hood. Use this skill whenever the user mentions
  anything email- or link-tracking-related, including: "send an email", "draft email", "email a contact",
  "email client", "schedule email", "send tomorrow", "send next week", "email queue", "scheduled emails",
  "email status", "email delivered", "opened", "bounced", "complaint", "create email sequence",
  "drip campaign", "nurture sequence", "onboarding email sequence", "welcome series",
  "enroll contact in sequence", "unenroll", "sequence step", "skip step", "pause sequence",
  "resume sequence", "shorten link", "tracked link", "short URL", "link analytics", "click stats",
  "click rate", "UTM", "merge fields", "personalize email", "email template", "Resend webhook",
  "email open rate", "email performance", "campaign", "email campaign", "launch campaign",
  "bulk email", "sending domain", "verify domain", "DNS records", "email domain", "from domain",
  "custom domain". If in doubt, trigger.
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

### Campaigns (bulk sends targeting segments or contact lists)

Campaigns are a higher-level construct that ties a **sequence** to an **audience** (a segment or explicit contact list) and manages enrollment in bulk. Lifecycle: `draft` → `active` → `completed`. Campaigns in `active` or `completed` status are read-only.

#### `GET /campaigns` — auth: client
List campaigns for an org. Filters: `orgId`, `status` (`draft`|`scheduled`|`active`|`paused`|`completed`).

Response: array of campaign objects, ordered by `createdAt` desc, soft-deletes excluded.

#### `POST /campaigns` — auth: client
Create a draft campaign.

Body:
```json
{
  "orgId": "org_xyz",
  "name": "Q2 Nurture Blast",
  "description": "Enroll all SMB leads in the 5-step nurture sequence",
  "fromDomainId": "domain_abc",
  "fromName": "Peet at Partners in Biz",
  "fromLocal": "hello",
  "replyTo": "peet@partnersinbiz.online",
  "segmentId": "seg_smb",
  "contactIds": [],
  "sequenceId": "seq_nurture_5step",
  "triggers": {
    "captureSourceIds": [],
    "tags": []
  }
}
```

Required: `name`. All other fields optional.

Audience resolution at launch time:
- Set `segmentId` to target all contacts matching a saved segment (resolved dynamically at launch).
- Set `contactIds` (array of contact IDs) for an explicit list.
- At least one of `segmentId` or `contactIds` must be present before launching.

`sequenceId` must reference an existing, non-deleted sequence in the same org. Email sender: `{fromLocal}@{domain.name}` where `fromDomainId` references an `email_domains` record.

Response (201): `{ id }`.

#### `GET /campaigns/[id]` — auth: client
Full campaign record.

#### `PUT /campaigns/[id]` — auth: client
Update any editable field. Only allowed when `status` is `draft` or `paused`; rejected with 422 for `active` or `completed`.

Editable fields: `name`, `description`, `fromDomainId`, `fromName`, `fromLocal`, `replyTo`, `segmentId`, `contactIds`, `sequenceId`, `triggers`.

Response: `{ id }`.

#### `DELETE /campaigns/[id]` — auth: client
Soft-delete. Does not cancel existing enrollments already created by a launch.

#### `POST /campaigns/[id]/launch` — auth: client
Launch a draft or paused campaign. Sets `status → active`, resolves audience, and bulk-enrolls contacts in the linked sequence.

Pre-launch requirements (validated server-side; returns 422 if unmet):
- Campaign must not already be `active` or `completed`
- `sequenceId` must be set and point to an existing sequence with at least one step
- `segmentId` or `contactIds` must be non-empty
- Segment (if used) must exist and belong to the same org
- Sequence must belong to the same org

Enrollment behaviour:
- Contacts with `unsubscribedAt` or `bouncedAt` are skipped automatically
- Contacts from a different org are skipped
- Already-enrolled contacts for this campaign (idempotency check on `campaignId` + `contactId`) are skipped
- Each new enrollment creates a `sequence_enrollments` doc (`status: active`) and an `activities` doc (`type: sequence_enrolled`)

Response:
```json
{ "enrolled": 312, "audienceSize": 340 }
```

`audienceSize` is the full resolved audience; `enrolled` is the net new enrollments created this launch (excluding skips).

---

### Email Domains (Resend sending domain management)

Register custom sending domains with Resend, retrieve DNS verification records, and monitor verification status. Domain status syncs live from Resend on each `GET /[id]` call.

Domain status lifecycle: `pending` → `verified` (once DNS records propagate and Resend confirms).

Use a verified domain's `id` as `fromDomainId` when creating campaigns so emails are sent from `{fromLocal}@{domainName}`.

#### `GET /email/domains` — auth: client
List all sending domains for an org. Filters: `orgId`.

Response: array of domain objects, soft-deletes excluded.

```json
[{
  "id": "domain_abc",
  "orgId": "org_xyz",
  "name": "mail.acme.com",
  "resendDomainId": "res_dom_123",
  "status": "verified",
  "region": "us-east-1",
  "dnsRecords": [...],
  "createdAt": "...",
  "lastSyncedAt": "..."
}]
```

#### `POST /email/domains` — auth: client
Register a new sending domain with Resend and store DNS records.

Body:
```json
{ "orgId": "org_xyz", "name": "mail.acme.com" }
```

Required: `name` (valid domain name, lowercased). Domain must not already be registered for the same org (409 if duplicate).

What happens:
1. Validates domain name format
2. Calls Resend `domains.create({ name })`
3. Persists domain doc with `status: pending` and the DNS records returned by Resend
4. Returns the DNS records the client must add to their DNS provider

Response (201):
```json
{
  "id": "domain_abc",
  "resendDomainId": "res_dom_123",
  "status": "pending",
  "dnsRecords": [
    { "record": "SPF", "name": "mail.acme.com", "type": "TXT", "ttl": "Auto",
      "status": "not_started", "value": "v=spf1 include:amazonses.com ~all", "priority": null },
    { "record": "DKIM", "name": "resend._domainkey.mail.acme.com", "type": "TXT",
      "ttl": "Auto", "status": "not_started", "value": "p=...", "priority": null },
    { "record": "DMARC", "name": "_dmarc.mail.acme.com", "type": "TXT",
      "ttl": "Auto", "status": "not_started", "value": "v=DMARC1; p=none;", "priority": null }
  ]
}
```

#### `GET /email/domains/[id]` — auth: client
Fetch domain and **refresh status live from Resend**. Always use this (not the list endpoint) to check current verification status — it calls `resend.domains.get(resendDomainId)` and updates the stored `status` and `dnsRecords` before responding.

Use this to poll until `status === 'verified'` after adding DNS records.

Response: full domain object with refreshed `status` and `dnsRecords`.

#### `DELETE /email/domains/[id]` — auth: client
Soft-delete locally and best-effort remove from Resend (`resend.domains.remove`). Resend removal failure is logged but does not block the local soft-delete.

Response: `{ id }`.

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

### 7. Launch a campaign to a segment

```bash
# 1. Ensure a verified domain exists
POST /email/domains
{ "orgId": "org_xyz", "name": "mail.acme.com" }
# → Add the returned dnsRecords to your DNS provider

# 2. Poll until verified
GET /email/domains/domain_abc
# Repeat until status === 'verified'

# 3. Create the campaign draft
POST /campaigns
{ "orgId": "org_xyz", "name": "Q2 SMB Nurture",
  "fromDomainId": "domain_abc", "fromName": "Peet", "fromLocal": "hello",
  "segmentId": "seg_smb", "sequenceId": "seq_nurture" }

# 4. Launch — enrolls all segment contacts in the sequence
POST /campaigns/campaign_xyz/launch
# → { enrolled: 312, audienceSize: 340 }

# 5. Monitor enrollments
GET /sequence-enrollments?sequenceId=seq_nurture&status=active
```

### 8. Register and verify a custom sending domain

```bash
# Register with Resend — get DNS records back
POST /email/domains
{ "orgId": "org_xyz", "name": "mail.acme.com" }
# → status: 'pending', dnsRecords: [{ record, name, type, value, ... }]

# Add each DNS record to your DNS provider (TXT records for SPF, DKIM, DMARC)

# Poll for verification (Resend can take a few minutes to hours)
GET /email/domains/domain_abc
# Repeat until status === 'verified'

# Domain is now usable as fromDomainId in campaigns
```

## Error reference

| HTTP | Error | Fix |
|------|-------|-----|
| 400 | `to is required` / `subject is required` | Supply fields |
| 400 | `bodyText or bodyHtml is required` | At least one body |
| 400 | `scheduledFor must be in the future` | Check timestamp |
| 400 | `Slug already taken` | Pick a different slug |
| 400 | `name is required` (campaign) | Supply campaign name |
| 400 | `sequenceId not found` | Verify sequence exists and belongs to same org |
| 400 | `Invalid domain name` | Use a valid domain format (e.g. `mail.acme.com`) |
| 404 | `Email not found` | Verify id |
| 404 | `Campaign not found` | Verify id / not soft-deleted |
| 404 | `Domain not found` | Verify id / not soft-deleted |
| 409 | `Cannot edit a sent email` | Only scheduled/draft are editable |
| 409 | `Domain already registered for this org` | Domain already exists; use existing record |
| 422 | `Campaign has no sequence` | Set `sequenceId` before launching |
| 422 | `Campaign has no audience` | Set `segmentId` or `contactIds` before launching |
| 422 | `Audience is empty` | Segment resolved to zero contacts |
| 422 | `Sequence has no steps` | Add at least one step to the sequence |
| 422 | `Campaign is already active/completed` | Cannot re-launch or edit in these states |
| 502 | `Resend rejected the domain` | Domain name invalid or Resend API error |

## Agent patterns

1. **Link `contactId` on every outbound** — activity log stays clean.
2. **Test before enroll** — `POST /email/send` with the rendered content to yourself before launching a sequence.
3. **Watch the complaint rate** — a single complaint flags; 3+ in 7 days → pause outreach and investigate.
4. **Use short links for every CTA** — you get click stats automatically.
5. **Merge fields require contact data** — ensure contacts have `name`, `company`, etc. populated before enrolling.
6. **Scheduling tip** — scheduled emails run at the cron cadence (daily 6am UTC). For precise timing, send directly and use `Retry-After` for rate limits.
7. **Unsubscribe handling** — never send to a contact with `unsubscribed: true` or auto-unsubscribed via Resend complaint.
8. **Campaigns vs. sequences** — use sequences for ongoing evergreen nurture (enroll one contact at a time); use campaigns for one-shot bulk sends to a segment or list. Campaigns enroll into a sequence under the hood.
9. **Domain verification timing** — Resend DNS propagation can take minutes to hours. Poll `GET /email/domains/[id]` (not the list endpoint) as it refreshes status live from Resend.
10. **`fromDomainId` must be verified** — campaigns will fail to send if the sending domain is still `pending`. Always confirm `status === 'verified'` before launching.
11. **Launch idempotency** — relaunching a paused campaign skips contacts already enrolled in that campaign, so no duplicate enrollments.
