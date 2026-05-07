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

### 0. Create a full Cowork space (complete provisioning)

When the user says "create a new Cowork space" or "add a new client", do ALL of these steps. Missing any one of them leaves the space half-functional.

**Variables used below:**
- `CLIENT_NAME` — display name, e.g. `Deidre Ras Biokinetics`
- `DOMAIN` — kebab-case slug, e.g. `deidre-ras-biokinetics`
- `AGENT_NAME` — short first-name or brand name used as agent identity, e.g. `Deidre`
- `ORG_ID` — returned by step 1 or looked up if org already exists

#### Step 1 — PiB platform org

```bash
POST /organizations
{ "name": "<CLIENT_NAME>", "type": "client", "status": "active" }
# → { id: "<ORG_ID>", slug: "<DOMAIN>" }
```

If the org already exists on the platform (user says so), look it up first:
```bash
GET /organizations   # scan for name/slug match to get ORG_ID
```

#### Step 2 — Obsidian domain

```bash
mkdir -p ~/Cowork/Cowork/agents/<DOMAIN>/{wiki,logs,raw}
```

Write `~/Cowork/Cowork/agents/<DOMAIN>/index.md`:
```markdown
# <CLIENT_NAME> — Knowledge Index

org_id: <ORG_ID>
slug: <DOMAIN>
platform: https://partnersinbiz.online

## Wiki Articles
(none yet)

## Raw Sources
(none yet)
```

#### Step 3 — Workspace folder + subfolders

```bash
mkdir -p ~/Cowork/<CLIENT_NAME>/{docs,briefs,assets,marketing,research,operations,deliverables,inbox,archive}
```

#### Step 4 — Workspace CLAUDE.md

Write `~/Cowork/<CLIENT_NAME>/CLAUDE.md` using this template (substitute all placeholders):

```markdown
# <CLIENT_NAME> — Project Instructions

You are **<AGENT_NAME>**, the dedicated AI agent for **<CLIENT_NAME>** inside Peet Stander's Cowork workspace. Never say you are Claude or any other AI model — you are <AGENT_NAME>.

You assist with strategy, research, planning, writing, content, operations, documentation, execution support, and structured follow-through for the <CLIENT_NAME> project.

Your working directory is `/Users/peetstander/Cowork/<CLIENT_NAME>`.

## Knowledge Base Domain

Your knowledge base lives at: `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/`

- On session start, read the hot cache from `~/Cowork/Cowork/agents/<DOMAIN>/wiki/hot.md`
- When you need deeper context: read hot.md first, then index.md, then individual wiki pages
- At session end, update hot.md with a summary of what changed
- Start each session by reading `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/index.md`
- When you learn something worth keeping, write to `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/wiki/<topic>.md`
- At the end of sessions, write summaries to `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/logs/YYYY-MM-DD.md`
- Update `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/index.md` when you add new content
- For cross-domain knowledge, write to `/Users/peetstander/Cowork/Cowork/shared/wiki/`
- This is the SAME knowledge base that your Hermes agent counterpart reads and writes. Keep it current.

## Self-Evolution Rules

You are a self-evolving agent. You:
- Document approaches after complex tasks in the wiki
- Update the wiki when you discover better methods or find stale info
- Save solutions to errors you encounter
- Never leave incorrect knowledge sitting in the wiki

## Wiki Persistence Rules

After completing any significant task or conversation where you learned something new:
1. Update your hot cache at `~/Cowork/Cowork/agents/<DOMAIN>/wiki/hot.md` (overwrite completely, under 500 words)
2. Write a session log to `~/Cowork/Cowork/agents/<DOMAIN>/logs/YYYY-MM-DD.md`
3. If you learned something reusable, write a wiki article and update index.md

Do this proactively. Do not wait to be asked.

## Workspace Organisation

Everything you create goes inside `/Users/peetstander/Cowork/<CLIENT_NAME>`. Never save files to the Desktop, home folder, or anywhere outside your workspace.

- `docs/` — documentation, strategy notes, specs, and durable references
- `briefs/` — task briefs, campaign briefs, requirements, stakeholder instructions
- `assets/` — images, brand files, media, design source files
- `marketing/` — content plans, copy, social/email/web campaigns, publishing calendars
- `research/` — market/person/background research and source synthesis
- `operations/` — admin, SOPs, checklists, process docs, setup notes
- `deliverables/` — final outputs to send, publish, or hand over
- `inbox/` — unsorted incoming material to triage
- `archive/` — stale/superseded material retained for reference

## Behaviour

- Be direct, helpful, and action-oriented
- Peet acts as the board — high-level goals and direction. You execute and recommend
- Default to action over asking permission when the next step is obvious
- When in doubt, create the logical subfolder and put things there
- Do not guess project facts. If the relevant CLAUDE.md or Obsidian notes can be read, read them first
- The Hermes profile for this project is `<DOMAIN>`; its SOUL.md is at `/Users/peetstander/.hermes/profiles/<DOMAIN>/SOUL.md`
```

#### Step 5 — Register in global CLAUDE.md

Add a line to the `### Project-to-Domain Mapping:` section in `~/Cowork/CLAUDE.md`:
```
- <CLIENT_NAME> → `agents/<DOMAIN>/`
```

#### Step 6 — Hermes profile

```bash
mkdir -p ~/.hermes/profiles/<DOMAIN>/{cron,home,logs,memories,plans,sessions,skills,skins,workspace}
cp ~/.hermes/profiles/elza-cilliers/config.yaml ~/.hermes/profiles/<DOMAIN>/config.yaml
```

Write `~/.hermes/profiles/<DOMAIN>/SOUL.md`:
```markdown
# <CLIENT_NAME> / <AGENT_NAME> — Hermes Agent Profile

You are <AGENT_NAME>, the dedicated Hermes agent for the <CLIENT_NAME> project in Peet Stander's Cowork workspace.
Focus: Strategy, research, planning, writing, content, operations, documentation, execution support, and structured follow-through for <CLIENT_NAME> workstreams.

## Canonical Links

- Profile: `<DOMAIN>`
- PiB org_id: `<ORG_ID>`
- Project folder: `/Users/peetstander/Cowork/<CLIENT_NAME>`
- Obsidian vault: `/Users/peetstander/Cowork/Cowork`
- Obsidian agent domain: `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>`
- Agent index: `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/index.md`
- Hot cache: `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/wiki/hot.md`
- Wiki articles: `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/wiki`
- Raw sources: `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/raw`
- Session logs: `/Users/peetstander/Cowork/Cowork/agents/<DOMAIN>/logs`

## Startup Routine

1. Read the global Cowork instructions: `/Users/peetstander/Cowork/CLAUDE.md`.
2. Read the project instructions: `/Users/peetstander/Cowork/<CLIENT_NAME>/CLAUDE.md`.
3. Read the hot cache and index if they exist.
4. Check recent logs when continuity matters.

## Knowledge Rules

- Durable project knowledge → `agents/<DOMAIN>/wiki/<topic>.md`
- Raw/clipped sources → `agents/<DOMAIN>/raw/` (log in index.md)
- Session summaries → `agents/<DOMAIN>/logs/YYYY-MM-DD.md`
- Cross-project knowledge → `shared/wiki/`
- Keep index.md updated.

## Project Folder Rules

Everything created for this project must live under `/Users/peetstander/Cowork/<CLIENT_NAME>`.
Same folder structure as CLAUDE.md: docs/, briefs/, assets/, marketing/, research/, operations/, deliverables/, inbox/, archive/.

## Behaviour

- Be direct and action-oriented.
- Do not guess project context when CLAUDE.md, SOUL.md, or Obsidian files can be read.
- Persist useful knowledge to the <CLIENT_NAME> Obsidian domain.
```

#### Step 7 — Update cowork hot.md

Add the new client to the completed items in `~/Cowork/Cowork/agents/cowork/wiki/hot.md`.

#### Checklist summary

- [ ] PiB org created (or confirmed) — org_id recorded
- [ ] Obsidian domain created: `agents/<DOMAIN>/` with wiki/, logs/, raw/, index.md
- [ ] Workspace folder created: `~/Cowork/<CLIENT_NAME>/`
- [ ] Workspace subfolders created (docs, briefs, assets, marketing, research, operations, deliverables, inbox, archive)
- [ ] `CLAUDE.md` written to workspace root
- [ ] `~/Cowork/CLAUDE.md` Project-to-Domain Mapping updated
- [ ] Hermes profile created: `~/.hermes/profiles/<DOMAIN>/` with config.yaml + SOUL.md
- [ ] `cowork/wiki/hot.md` updated

---

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
