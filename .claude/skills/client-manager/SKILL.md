---
name: client-manager
description: >
  Manage client organisations and onboarding on the Partners in Biz platform. Create orgs, invite and
  manage team members, link client records, generate client logins, update brand profiles, route portal
  enquiries and messages, and run product onboarding flows. Use this skill whenever the user mentions
  anything related to clients or organisations, including but not limited to: "create a client",
  "new client", "set up a new org", "create organisation", "onboard a client", "client onboarding",
  "athletic club onboarding", "athleet onboarding", "invite team member", "add a user to an org",
  "invite user", "remove member", "change member role", "client members", "client team", "client roles",
  "list organisations", "list clients", "client settings", "client billing details",
  "link client to org", "link a client account", "create login for client", "create client login",
  "client portal message", "respond to enquiry", "log enquiry", "enquiry inbox",
  "update brand profile", "set brand colors", "set brand voice", "brand guidelines",
  "fetch brand profile", "send brand kit", "platform owner", "organisation slug",
  "leave a note on this client", "comment on client", "@mention client owner",
  "notify when new client is created", "client created webhook". If in doubt, trigger — this skill owns
  the full client/organisation lifecycle.
---

# Client Manager — Partners in Biz Platform API

This skill handles the full client lifecycle on Partners in Biz: creating client organisations, managing members and roles, linking CRM contacts to billing orgs, issuing portal logins, running product-specific onboarding flows, routing portal enquiries, and maintaining brand profiles that downstream skills (content, social, email) read from.

## Base URL & Authentication

```
https://partnersinbiz.online/api/v1
```

All authenticated endpoints require:

```
Authorization: Bearer <AI_API_KEY>
```

AI agents and admins have full access. Override base URL via `PIB_API_BASE` for local dev.

## orgId conventions

- `organisations` are **top-level tenants**. There is a `platform_owner` org (type = `platform_owner`) and many `client` orgs (type = `client`).
- Most endpoints scope by `orgId` in the path or body. When a route takes `orgId` in the path (`/organizations/[id]`), that IS the org.
- Cross-resource endpoints (`/comments`, `/notifications`) take `orgId` as query or body.

## Collaboration primitives

Every resource this skill creates/modifies records `createdBy` + `createdByType: 'user' | 'agent' | 'system'`. Agents leave trails exactly like humans do.

- **Idempotency**: any `POST` that creates a resource accepts an `Idempotency-Key` header. Same key replays the cached response for 24h.
- **Unified comments**: see `POST /comments` with `resourceType: 'client_org'` — leave notes on a client org.
- **Unified inbox**: `GET /inbox` aggregates assignments, mentions, enquiries, overdue items across the workspace.
- **Notifications**: created automatically for team invites, enquiry replies, brand updates.

## Response envelope

```json
{ "success": true, "data": { ... }, "meta": { "total": 50, "page": 1, "limit": 20 } }
{ "success": false, "error": "Human-readable message" }
```

---

## API Reference

### Organisations

#### `GET /organizations` — auth: client
List orgs the current user has access to. AI/admin sees all active orgs; clients see only orgs they are a member of.

Response: array of `OrganizationSummary`:
```json
{ "id": "org_abc", "name": "Acme", "slug": "acme", "type": "client", "status": "active",
  "description": "...", "logoUrl": "...", "website": "...", "memberCount": 3, "createdAt": "...", "updatedAt": "..." }
```

#### `POST /organizations` — auth: admin
Create a new organisation.

Body:
```json
{
  "name": "Acme Corp",
  "type": "client",
  "status": "active",
  "description": "...",
  "logoUrl": "...",
  "website": "...",
  "industry": "...",
  "billingEmail": "billing@acme.com",
  "plan": "pro"
}
```

Required: `name`. Slug is auto-generated via `slugify(name)` — 409 if slug already taken.

Response (201): `{ "id": "org_xyz", "slug": "acme-corp" }`

The creating user is added as `{ userId, role: 'owner' }` in `members`.

#### `GET /organizations/[id]` — auth: admin
Full org document including `members[]`, `settings`, `brandProfile`, `billingDetails`.

#### `PUT /organizations/[id]` — auth: admin
Update org fields. Any of: `name`, `description`, `logoUrl`, `website`, `industry`, `billingEmail`, `status`, `plan`, `brandProfile`, `settings`, `billingDetails`.

`settings` and `billingDetails` merge (deep for `billingDetails.address` + `billingDetails.bankingDetails`). `brandProfile` replaces the whole object — use the dedicated `PUT /agent/brand/[orgId]` for partial brand writes.

#### `DELETE /organizations/[id]` — auth: admin
Soft-delete (`active: false`). Record stays for audit.

### Members

#### `GET /organizations/[id]/members` — auth: admin
List members with user details (displayName, email, photoURL joined from `users` collection).

#### `POST /organizations/[id]/members` — auth: admin
Add a member by email. Body: `{ email: string, role?: 'owner'|'admin'|'member' }`. Defaults role to `member`.

If the user exists in Firebase Auth, they're added directly. If not, the route creates an invite record — check response for `{ inviteSent: true, userId? }`.

#### `GET /organizations/[id]/members/[userId]` — auth: admin
Get a single member with user details.

#### `PUT /organizations/[id]/members/[userId]` — auth: admin
Update member role. Body: `{ role: 'owner'|'admin'|'member' }`. Cannot demote the last owner.

#### `DELETE /organizations/[id]/members/[userId]` — auth: admin
Remove a member. Cannot remove the last owner.

### Org accounts (billing/stripe linkage placeholder)

#### `GET /organizations/[id]/accounts` — auth: admin
Returns billing/subscription account details for the org (platform-owner-only records). Read this to determine plan + status before generating invoices or linking clients.

### Link client

#### `POST /organizations/[id]/link-client` — auth: admin
Associate a CRM contact/client with an org. Body: `{ clientId: string }`. Sets `linkedClientId` on org. Useful when a contact converts to a paying org.

Response: `{ orgId, clientId, linked: true }`.

### Create login

#### `POST /organizations/[id]/create-login` — auth: admin
Provision a portal login for a client user. Body:
```json
{ "email": "contact@acme.com", "displayName": "Jane Doe", "role": "member" }
```

Creates a Firebase Auth user (or links an existing one) and adds them to `members`. Sends a welcome email with a sign-in link. Returns `{ userId, inviteSent: true }`.

### Clients (legacy/simple list)

A lightweight "contact-of-contacts" collection used by the admin UI. For full CRM power, use the `crm-sales` skill's `/crm/contacts`.

#### `GET /clients` — auth: admin
List all clients ordered by `createdAt desc`.

#### `POST /clients` — auth: admin
Create a client record. Required: `name`, `email` (valid). Optional: `company`, `phone`, `status`, `tags`, `source`, `notes`.

### Onboarding (product-specific)

#### `POST /onboarding` — **public, no auth**
Public submission endpoint for product onboarding. Currently scoped to the Athleet product. Any public form-style submission should use this for pre-product intake.

Body (Athleet):
```json
{
  "product": "athleet-management",
  "clubName": "Blue Bulls Rugby",
  "contactName": "Coach Smith",
  "contactEmail": "coach@bluebulls.com",
  "contactPhone": "+27...",
  "memberCount": 80,
  "notes": "..."
}
```

Required: `product` (must be in `['athleet-management']`), `clubName`, `contactEmail` (valid). Creates a record in `onboarding_submissions` and emails the platform owner.

### Portal enquiries

Inbound enquiries from the public portal.

#### `GET /portal/enquiries` — auth: admin
List enquiries. Filter by `status` (`new`, `read`, `replied`, `archived`).

#### `POST /portal/enquiries` — **public**
Submit a new enquiry. Body: `{ name, email, message, source? }`.

#### `GET /portal/enquiries/[id]` — auth: admin
#### `PATCH /portal/enquiries/[id]` — auth: admin
Update `status` or add `replyNote`.

### Portal messages

#### `GET /portal/messages` — auth: admin
Inbox of messages between platform and client users across all orgs.

#### `POST /portal/messages` — auth: admin or client
Send a message. Body: `{ orgId, subject, body, threadId? }`.

### Brand profile

Agents depend on this endpoint for every piece of content they generate.

#### `GET /agent/brand/[orgId]` — auth: admin
Returns:
```json
{ "orgId": "...", "name": "Acme", "industry": "...",
  "brandProfile": { "voice": "...", "audience": "...", "personas": [...], "doNotDo": [...],
                    "tagline": "...", "logoUrl": "...", "examples": [...] },
  "brandColors": { "primary": "#...", "secondary": "#...", "accent": "#..." } }
```

#### `PUT /agent/brand/[orgId]` — auth: admin
Partial update — merges into `brandProfile` (top-level) and `settings.brandColors`. Requires at least one of `brandProfile` / `brandColors`.

Body:
```json
{ "brandProfile": { "voice": "confident, warm", "tagline": "Grow with clarity" },
  "brandColors": { "primary": "#1a5fb4" } }
```

Response: `{ orgId, updated: true }`.

### Comments (unified)

Leave human/agent notes on a client org.

#### `POST /comments` — auth: admin
Body:
```json
{ "orgId": "org_abc", "resourceType": "client_org", "resourceId": "org_abc",
  "body": "Hi @user:uid123, client wants to upgrade to Pro plan.",
  "parentCommentId": null, "attachments": [] }
```

`@user:<uid>` and `@agent:<id>` in body auto-create mention notifications. Denormalised `mentionIds` field enables fast inbox lookups.

#### `GET /comments?orgId=X&resourceType=client_org&resourceId=org_abc` — auth: admin
List comments on this client org. Sorted `createdAt asc`.

#### `PATCH /comments/[id]` — auth: admin
Update body or set `agentPickedUp: true` (sets `agentPickedUpAt` the first time).

### Notifications (client-related)

#### `GET /notifications?orgId=X&type=client.created` — auth: admin
Client-related types: `client.created`, `member.invited`, `member.removed`, `enquiry.received`, `brand.updated`, `onboarding.submitted`.

---

## Workflow guides

### 1. Create a new client end-to-end

```bash
# 1. Create the org
POST /organizations
{ "name": "Acme Corp", "type": "client", "industry": "SaaS", "billingEmail": "billing@acme.com" }
# → { id: "org_abc", slug: "acme-corp" }

# 2. Set brand profile (optional but recommended before content generation)
PUT /agent/brand/org_abc
{ "brandProfile": { "voice": "confident, warm", "audience": "SMB founders" },
  "brandColors": { "primary": "#1a5fb4" } }

# 3. Set billing details
PUT /organizations/org_abc
{ "billingDetails": {
    "address": { "line1": "...", "city": "...", "postalCode": "...", "country": "ZA" },
    "vatNumber": "...", "phone": "..." } }

# 4. Create login for primary contact
POST /organizations/org_abc/create-login
{ "email": "jane@acme.com", "displayName": "Jane Doe", "role": "owner" }

# 5. Kick off onboarding (if applicable product)
POST /onboarding
{ "product": "athleet-management", "clubName": "...", "contactEmail": "jane@acme.com", ... }

# 6. Leave an internal note
POST /comments
{ "orgId": "org_abc", "resourceType": "client_org", "resourceId": "org_abc",
  "body": "Created by @agent:pip. Plan: Pro. Billing starts next month." }
```

### 2. Invite and manage team members

```bash
POST /organizations/org_abc/members       # invite
{ "email": "alex@acme.com", "role": "admin" }

PUT /organizations/org_abc/members/user_xyz
{ "role": "member" }                       # demote

DELETE /organizations/org_abc/members/user_xyz
```

### 3. Track enquiries and respond

```bash
GET /portal/enquiries?status=new
PATCH /portal/enquiries/enq_123
{ "status": "replied", "replyNote": "Sent quote on 2026-04-15" }
```

### 4. Update brand profile (agent-driven)

```bash
GET /agent/brand/org_abc      # read current
PUT /agent/brand/org_abc      # merge partial update
{ "brandProfile": { "voice": "...", "examples": ["..."] } }
```

### 5. Product onboarding (Athleet)

Public endpoint — used by the public onboarding form on the marketing site:
```bash
POST /onboarding
{ "product": "athleet-management", "clubName": "Blue Bulls", "contactName": "Coach",
  "contactEmail": "coach@bluebulls.com", "contactPhone": "+27...", "memberCount": 80 }
```

## Error reference

| HTTP | Error | Fix |
|------|-------|-----|
| 400 | `name is required` | Provide org name |
| 400 | `Email is invalid` | Check email format |
| 401 | Unauthorized | Check `AI_API_KEY` |
| 403 | Forbidden | User not a member of org |
| 404 | `Organisation not found` | Verify orgId |
| 409 | `Slug "X" already taken` | Choose different name |
| 409 | `Cannot demote last owner` | Promote another member first |

## Agent patterns

1. **Always check `orgId` first** — every create needs it. Ask the user or look up via `GET /organizations`.
2. **Read brand profile before generating content** — `GET /agent/brand/[orgId]` is the source of truth for voice/colours.
3. **Idempotency on client creation** — pass `Idempotency-Key: <uuid>` on `POST /organizations` to avoid duplicates.
4. **Leave a comment after you do something** — `POST /comments resourceType=client_org` so the human sees what the agent did.
5. **Subscribe webhooks** — for notifications on client creation/updates, point an outbound webhook at `contact.created` / `client.created` (see `platform-ops` skill).
