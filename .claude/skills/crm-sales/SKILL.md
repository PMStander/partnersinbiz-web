---
name: crm-sales
description: >
  Run the full sales cycle on Partners in Biz: contacts, leads, deals, pipeline, quotes, proposals,
  activity logging, AI-generated contact briefs, public lead-capture forms, and form submission triage.
  Use this skill whenever the user mentions anything related to sales or CRM, including but not limited
  to: "add a contact", "new lead", "import contacts", "tag contact", "remove tag", "filter by tag",
  "qualify lead", "convert lead to client", "contact brief", "brief me on this contact",
  "AI contact summary", "new deal", "create deal", "move deal to negotiation", "deal stage",
  "close deal", "deal won", "deal lost", "win rate", "pipeline value", "pipeline report",
  "log a call", "log email", "activity history", "draft a quote", "send proposal", "create proposal",
  "quote accepted", "quote rejected", "convert quote to invoice", "create a form", "lead form",
  "contact form", "form submissions", "new form submission", "review submissions",
  "schedule meeting with contact", "task for this deal", "comment on contact", "comment on deal",
  "leave a note on deal", "@mention sales rep", "sales notification". If in doubt, trigger — this skill
  owns the full lead-to-won lifecycle.
---

# CRM & Sales — Partners in Biz Platform API

Covers the full sales funnel: contacts (leads → prospects → clients → churned), deals with stages, activity logging, quotes/proposals, AI contact briefings, and public lead-capture forms with submission triage.

## Base URL & Authentication

```
https://partnersinbiz.online/api/v1
```

```
Authorization: Bearer <AI_API_KEY>
```

Except for `POST /forms/[slug]/submit` which is **public** (no auth required).

## orgId conventions

- `contacts`, `deals`, `activities`, `quotes`, `forms`, `form_submissions` all carry `orgId` as a field.
- **Important current limitation:** legacy `contacts` and `deals` may not have `orgId` set. When you create new ones, always pass `orgId` in the body so webhook dispatch works.
- For filters: pass `?orgId=X` as query param on GET.

## Collaboration primitives

- **Idempotency**: `POST /crm/contacts`, `POST /crm/deals`, `POST /quotes`, `POST /tasks` accept `Idempotency-Key` header
- **Comments** (`resourceType: 'contact' | 'deal' | 'quote' | 'form_submission'`): leave internal notes with `@user:<uid>` / `@agent:<id>` mentions
- **Tasks** linked to contacts/deals: `POST /tasks` with `contactId` / `dealId` — see `project-management` skill
- **Calendar events** linked to contacts/deals: `POST /calendar/events` with `relatedTo: { type: 'contact'|'deal', id }` — see `project-management` skill

## Response envelope

```json
{ "success": true, "data": { ... }, "meta": { "total": 50, "page": 1, "limit": 20 } }
```

---

## API Reference

### Contacts

#### `GET /crm/contacts` — auth: admin
List contacts with filters.

Query params:
- `stage` — `new`|`contacted`|`replied`|`demo`|`proposal`|`won`|`lost`
- `type` — `lead`|`prospect`|`client`|`churned`
- `source` — `manual`|`form`|`import`|`outreach`
- `tags` — comma-separated (array-contains-any, max 10)
- `search` — name/email/company contains (in-memory after fetch)
- `page` (default 1), `limit` (default 50, max 200)

Response: array of `Contact`:
```json
{ "id": "contact_abc", "orgId": "org_xyz", "name": "Jane Doe", "email": "jane@acme.com",
  "phone": "+27...", "company": "Acme", "website": "https://acme.com",
  "source": "form", "type": "lead", "stage": "new",
  "tags": ["enterprise", "south-africa"], "notes": "...", "assignedTo": "user_123",
  "createdAt": "...", "updatedAt": "...", "lastContactedAt": null, "deleted": false }
```

#### `POST /crm/contacts` — auth: admin
Required: `orgId`, `name`, `email` (valid). Defaults: `source='manual'`, `type='lead'`, `stage='new'`, `tags=[]`.

`orgId` is **required** — contacts must belong to an organisation so webhooks and org-scoped reports work. 400 if missing.

Body:
```json
{
  "orgId": "org_xyz",  
  "name": "Jane Doe",
  "email": "jane@acme.com",
  "phone": "+27...",
  "company": "Acme",
  "website": "https://acme.com",
  "source": "form",
  "type": "lead",
  "stage": "new",
  "tags": ["enterprise"],
  "notes": "Met at conference",
  "assignedTo": "user_123"
}
```

Response (201): `{ "id": "contact_abc" }`. Dispatches `contact.created` webhook when `orgId` present.

#### `GET /crm/contacts/[id]` — auth: admin
Full contact.

#### `PUT /crm/contacts/[id]` — auth: admin
Update any contact field. Records `updatedAt`. Dispatches `contact.updated` webhook.

#### `DELETE /crm/contacts/[id]` — auth: admin
Soft-delete (`deleted: true`).

#### `GET /crm/contacts/[id]/activities` — auth: admin
Activity timeline for this contact. Sorted `createdAt desc`.

#### `POST /crm/contacts/[id]/activities` — auth: admin
Log activity. Body: `{ type, summary, dealId?, metadata? }`. `type`: `email_sent`|`email_received`|`call`|`note`|`stage_change`|`sequence_enrolled`|`sequence_completed`.

#### `POST /crm/contacts/[id]/tags` — auth: admin
Atomic tag update. Body: `{ add?: string[], remove?: string[] }`. Uses Firestore `arrayUnion` / `arrayRemove`. Returns `{ id, tags }` (post-update).

### Deals

#### `GET /crm/deals` — auth: admin
Filters: `stage`, `contactId`, `page`, `limit`.

Response: array of `Deal`:
```json
{ "id": "deal_xyz", "orgId": "org_abc", "contactId": "contact_abc",
  "title": "Acme - Pro Plan - Annual", "value": 12000, "currency": "ZAR",
  "stage": "proposal", "expectedCloseDate": "2026-05-30", "notes": "...",
  "createdAt": "...", "updatedAt": "...", "deleted": false }
```

#### `POST /crm/deals` — auth: admin
Required: `orgId`, `title`, `contactId`. Defaults: `value=0`, `currency='USD'`, `stage='discovery'`.
Currencies: `USD`, `EUR`, `ZAR`. `orgId` is **required** — 400 if missing. Dispatches `deal.created`.

#### `GET/PUT/DELETE /crm/deals/[id]` — auth: admin
PUT dispatches `deal.stage_changed` when `stage` changes; if new stage is `won` → also `deal.won`; if `lost` → also `deal.lost`.

### CRM activities (cross-cutting)

#### `GET /crm/activities` — auth: admin
All activities across contacts/deals. Filters: `contactId`, `dealId`, `type`, `from`, `to`, `page`, `limit`.

#### `POST /crm/activities` — auth: admin
Log an activity not tied to a specific contact resource (e.g., generic meeting note).

### Quotes

#### `GET /quotes` — auth: admin
List quotes. Filter `?orgId=X`. Sorted `createdAt desc`, limit 50.

#### `POST /quotes` — auth: admin
Required: `orgId` (the client org), `lineItems: [{ description, quantity, unitPrice }]`.

Body:
```json
{
  "orgId": "org_abc",
  "lineItems": [{ "description": "Implementation", "quantity": 1, "unitPrice": 50000 }],
  "taxRate": 15,
  "currency": "ZAR",
  "notes": "...",
  "validUntil": "2026-05-31"
}
```

Auto-snapshots: `fromDetails` (from platform owner org), `clientDetails` (from client org `billingDetails`).
Auto-computes: `subtotal`, `taxAmount`, `total`. Assigns sequential `quoteNumber`.

Response (201): `{ id, quoteNumber }`. Dispatches `quote.created`.

#### `GET /quotes/[id]` — auth: admin
Full quote.

#### `PATCH /quotes/[id]` — auth: admin
Update fields. Status transitions: `draft` → `sent` → `accepted` | `rejected` | `converted`.
- On `status=accepted`: dispatches `quote.accepted`
- On `status=rejected`: dispatches `quote.rejected`
- On `status=converted`: typically paired with creating an invoice from the quote

#### `DELETE /quotes/[id]` — auth: admin
Soft-delete.

### AI Contact Brief

#### `GET /ai/contact-brief/[id]` — auth: admin
Generates an AI-written briefing on a contact using their activity history + company info.

Returns:
```json
{ "contactId": "contact_abc", "brief": "Markdown briefing...",
  "talkingPoints": ["..."], "recentActivity": [...], "generatedAt": "..." }
```

Use this before any outbound call or email.

### Forms (lead capture)

#### `GET /forms` — auth: admin
List. Filters: `orgId` (required), `active`, `search`, `page`, `limit`.

#### `POST /forms` — auth: admin (idempotent)
Create a form.

Body:
```json
{
  "orgId": "org_abc",
  "name": "Homepage Enquiry",
  "slug": "homepage-enquiry",
  "title": "Get in touch",
  "description": "...",
  "fields": [
    { "id": "name", "type": "text", "label": "Your name", "required": true },
    { "id": "email", "type": "email", "label": "Email", "required": true },
    { "id": "message", "type": "textarea", "label": "How can we help?", "required": false }
  ],
  "thankYouMessage": "Thanks — we'll be in touch.",
  "notifyEmails": ["sales@acme.com"],
  "redirectUrl": null,
  "createContact": true,
  "rateLimitPerMinute": 10,
  "active": true
}
```

`slug` must be unique per org. Supported field types: `text`, `textarea`, `email`, `phone`, `number`, `select`, `multiselect`, `checkbox`, `radio`, `date`, `file`, `hidden`.

**Optional Turnstile (Cloudflare) CAPTCHA**: include `turnstileEnabled: true` and `turnstileSiteKey: "<site_key>"` on the form. Requires `TURNSTILE_SECRET_KEY` env var. Public page embeds `<div class="cf-turnstile" data-sitekey="<siteKey>">` and the widget's hidden `cf-turnstile-response` field must be submitted with the body. Submit endpoint verifies against Cloudflare and rejects invalid tokens with 400.

Response (201): `{ id, slug }`.

#### `GET/PUT/DELETE /forms/[id]` — auth: admin
`slug` can only change if no submissions exist yet (409 otherwise).

#### `POST /forms/[slug]/submit` — **public, no auth**
Query param: `?orgId=X` (required). Body is the form data keyed by `fieldId`.

Safeguards:
- Form must be `active: true`
- Honeypot field `_hp` — if populated, silent accept (returns 200 with thankYouMessage)
- Per-IP rate limit (default 10/min, configurable on form)
- Field validation (type, required, min/max, pattern)
- Optional Cloudflare Turnstile CAPTCHA — set `turnstileEnabled: true` + `turnstileSiteKey` on the form. The public widget injects `cf-turnstile-response`; the server verifies via `TURNSTILE_SECRET_KEY`

Response:
```json
{ "success": true, "data": {
    "submitted": true, "thankYou": "Thanks — we'll be in touch.", "redirectUrl": null } }
```

If `createContact: true` and `email` is valid, upserts a `Contact` (source=`form`) and links it via `contactId` on the submission. Dispatches `form.submitted` webhook.

#### `GET /forms/[id]/submissions` — auth: admin
Filters: `status` (`new`|`read`|`archived`), `from`, `to`, `page`, `limit`.

#### `GET/PATCH /forms/[id]/submissions/[subId]` — auth: admin
PATCH updates `status`.

### Comments on CRM resources

#### `POST /comments`
```json
{ "orgId": "org_abc", "resourceType": "deal", "resourceId": "deal_xyz",
  "body": "Sending renewal quote tomorrow. @user:uid123 please review." }
```

Supported `resourceType` for this skill: `contact`, `deal`, `quote`, `form_submission`.

### Tasks & meetings linked to contacts/deals

See the `project-management` skill for full task and calendar APIs. Quick patterns used here:

```bash
# Task for a deal
POST /tasks
{ "orgId": "org_abc", "title": "Send proposal draft", "dueDate": "2026-04-20",
  "priority": "high", "dealId": "deal_xyz", "assignedTo": { "type": "user", "id": "uid123" } }

# Meeting with contact
POST /calendar/events
{ "orgId": "org_abc", "title": "Acme demo", "startAt": "2026-04-22T14:00:00Z",
  "endAt": "2026-04-22T15:00:00Z",
  "relatedTo": { "type": "contact", "id": "contact_abc" },
  "attendees": [{ "name": "Jane Doe", "email": "jane@acme.com", "status": "pending" }] }
```

---

## Workflow guides

### 1. Lead → form → contact → deal → quote → won

```bash
# Lead submits form (public)
POST /forms/homepage-enquiry/submit?orgId=org_abc
{ "name": "Jane", "email": "jane@acme.com", "message": "..." }
# → createContact:true upserts Contact, dispatches form.submitted

# Sales rep qualifies
PUT /crm/contacts/contact_abc
{ "stage": "contacted", "type": "prospect" }

# Create deal
POST /crm/deals
{ "orgId": "org_abc", "contactId": "contact_abc",
  "title": "Acme - Pro Plan", "value": 12000, "currency": "ZAR", "stage": "discovery" }

# Get AI brief before demo call
GET /ai/contact-brief/contact_abc

# Log the call
POST /crm/contacts/contact_abc/activities
{ "type": "call", "summary": "30-min demo — ready for proposal", "dealId": "deal_xyz" }

# Move deal forward
PUT /crm/deals/deal_xyz
{ "stage": "proposal" }   # dispatches deal.stage_changed

# Create quote
POST /quotes
{ "orgId": "org_abc", "lineItems": [{ "description": "Pro Plan — annual",
  "quantity": 1, "unitPrice": 12000 }], "taxRate": 15, "currency": "ZAR" }

# Send quote externally, then mark accepted
PATCH /quotes/quote_123
{ "status": "accepted" }  # dispatches quote.accepted

# Close-won
PUT /crm/deals/deal_xyz
{ "stage": "won" }  # dispatches deal.stage_changed + deal.won

# Convert: create invoice (see billing-finance skill)
```

### 2. Tag and segment contacts

```bash
# Bulk tag adds via individual calls (no bulk endpoint today)
POST /crm/contacts/contact_abc/tags
{ "add": ["enterprise", "south-africa"] }

# Filter by tags
GET /crm/contacts?tags=enterprise,south-africa
```

### 3. Build a public lead-capture form

```bash
POST /forms
{ "orgId": "org_abc", "name": "Demo request", "slug": "demo-request", ... }

# Public URL to embed:
#   <form action="https://partnersinbiz.online/api/v1/forms/demo-request/submit?orgId=org_abc" method="POST">

GET /forms/form_123/submissions?status=new  # triage inbox
```

### 4. Pipeline view

Use the `platform-ops` skill's `/reports/pipeline` endpoint for `byStage` counts + values + win rate.

## Error reference

| HTTP | Error | Fix |
|------|-------|-----|
| 400 | `Name is required` / `Email is required` | Supply field |
| 400 | `Email is invalid` | Valid format |
| 400 | `Invalid stage` / `Invalid currency` | Use allowed values |
| 400 | `tags param exceeds 10` | Split into smaller batches |
| 400 | `Missing _orgId_ query param` (form submit) | Include `?orgId=X` |
| 400 | Form validation errors | Check field constraints |
| 404 | `Contact not found` / `Deal not found` | Verify ID |
| 409 | `Cannot change slug after submissions exist` | Use new form or archive old |
| 429 | Form rate limit exceeded | Retry after `Retry-After` seconds |

## Agent patterns

1. **Always pass `orgId`** on new contacts/deals — webhook dispatch depends on it.
2. **Get a contact brief before calls** — `GET /ai/contact-brief/[id]` is cheap and rich.
3. **Log activities proactively** — AI should log every call/email so future briefs are accurate.
4. **Use tags for segmentation** — cheaper than custom fields and queryable with `array-contains-any`.
5. **Webhook subscriptions** — listen for `contact.created`, `deal.won`, `form.submitted` to trigger downstream flows (see `platform-ops`).
6. **Idempotency** — pass `Idempotency-Key` on creates to dedupe.
