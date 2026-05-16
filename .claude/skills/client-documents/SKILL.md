---
name: client-documents
description: Create, review, publish, and track client-facing PiB documents including proposals, specs, social strategies, content campaign plans, reports, launch sign-offs, and change requests.
---

# Client Documents

Use this whenever Peet asks for a proposal, spec, strategy document, sign-off, report, change request, approval pack, or any client-facing document.

## What This Is

`client_documents` are the collaboration and approval layer between PiB and clients. They live at:
- Admin view: `https://partnersinbiz.online/admin/documents/[id]`
- Org-scoped admin: `https://partnersinbiz.online/admin/org/[slug]/documents/[id]`
- Client portal: `https://partnersinbiz.online/portal/documents/[id]`
- Public share page: `https://partnersinbiz.online/d/[shareToken]` (only after publish)

Projects, campaigns, CRM deals, reports, SEO sprints, and social posts remain the operational source of truth. Documents are linked to them via `document.linked`.

---

## Document Types & Templates

| `type` / `templateId` | Label | Approval mode | Use for |
|---|---|---|---|
| `sales_proposal` | Sales Proposal | `formal_acceptance` | New client pitches, SOW-level agreements |
| `build_spec` | Website/App Build Spec | `operational` | Web/app project scopes |
| `social_strategy` | Social Media Strategy | `operational` | Social channel + content strategies |
| `content_campaign_plan` | Content Campaign Plan | `operational` | Campaign briefs, asset plans |
| `monthly_report` | Monthly Report | `operational` | Monthly performance reviews |
| `launch_signoff` | Launch Sign-off | `operational` | Go-live checklists and sign-off |
| `change_request` | Change Request | `operational` | Scope/budget/timeline change requests |

**Approval modes:**
- `operational` — client clicks an "Approve" button (most documents)
- `formal_acceptance` — client must type their name + check a box (proposals/SOW only)

---

## Block Types

Each document version is an ordered array of `DocumentBlock` objects. Fill `content` based on block type:

| Block type | Content shape | Notes |
|---|---|---|
| `hero` | `string` (subtitle / tagline) | Always first. Title comes from `document.title`. |
| `summary` | `string` (markdown prose) | Executive summary or overview |
| `problem` | `string` (markdown prose) | Problem statement, audience pain, context |
| `scope` | `string` or `string[]` (bullet list) | What is in scope |
| `deliverables` | `string[]` (list of deliverables) | Concrete outputs |
| `timeline` | `{ phases: [{ label: string, duration: string, description?: string }] }` | Milestone phases |
| `investment` | `{ items: [{ label: string, amount: number, currency?: string }], total: number, currency?: string, notes?: string }` | Pricing table |
| `terms` | `string` (markdown prose) | Payment terms, IP, cancellation |
| `approval` | `string` (instructions text for client) | Shown above the approve button |
| `metrics` | `{ items: [{ label: string, value?: string, target?: string, description?: string }] }` | KPIs / success metrics |
| `risk` | `string[]` or `string` | Known risks, assumptions, limitations |
| `table` | `{ headers: string[], rows: string[][] }` | Generic data table |
| `gallery` | `string[]` (image URLs) | Image gallery |
| `callout` | `{ title: string, body: string, variant?: 'info'|'warning'|'success' }` | Highlighted callout box |
| `rich_text` | `string` (markdown) | Free-form markdown section |

**Display motion options (optional):** `none` | `reveal` | `sticky` | `counter` | `timeline`

---

## Status Flow

```
internal_draft → internal_review → client_review → changes_requested → approved → accepted
                                                                       ↑_________↓ (loop)
```
- `internal_draft` / `internal_review`: not visible to client
- `client_review`: client can see and comment (requires publish)
- `changes_requested`: client requested changes via portal
- `approved`: operational approval given
- `accepted`: formal acceptance signed (proposals only)
- `archived`: soft-deleted from active views

---

## Full API Reference

Base URL: `https://partnersinbiz.online`
Auth: `Authorization: Bearer <AI_API_KEY>` + `X-Org-Id: <orgId>` on every request.
All responses: `{ success: boolean, data: ... }` — always unwrap `body.data ?? body`.

### Documents

| Method | Route | Body / Params | Notes |
|---|---|---|---|
| `GET` | `/api/v1/client-documents` | `?orgId=&status=&type=&limit=&page=` | List documents |
| `POST` | `/api/v1/client-documents` | `{ orgId, title, type, templateId?, linked? }` | Create document (starts as `internal_draft`) |
| `GET` | `/api/v1/client-documents/[id]` | — | Fetch single document |
| `PATCH` | `/api/v1/client-documents/[id]` | `{ title?, status?, orgId?, linked?, assumptions?, clientPermissions?, shareEnabled? }` | Update metadata |
| `DELETE` | `/api/v1/client-documents/[id]` | — | Archive (soft delete) |
| `POST` | `/api/v1/client-documents/[id]/publish` | `{}` | Move to `client_review`, generate shareToken |

### Versions

| Method | Route | Body | Notes |
|---|---|---|---|
| `GET` | `/api/v1/client-documents/[id]/versions` | — | List all versions |
| `POST` | `/api/v1/client-documents/[id]/versions` | `{ blocks, theme, changeSummary? }` | Create new draft version |
| `GET` | `/api/v1/client-documents/[id]/versions/[versionId]` | — | Fetch specific version |

### Comments

| Method | Route | Body | Notes |
|---|---|---|---|
| `GET` | `/api/v1/client-documents/[id]/comments` | `?blockId=&status=` | List comments |
| `POST` | `/api/v1/client-documents/[id]/comments` | `{ text, blockId?, anchor? }` | Add comment |
| `PATCH` | `/api/v1/client-documents/[id]/comments/[commentId]` | `{ status }` | Resolve comment |

### Suggestions

| Method | Route | Body | Notes |
|---|---|---|---|
| `GET` | `/api/v1/client-documents/[id]/suggestions` | `?blockId=&status=` | List suggestions |
| `POST` | `/api/v1/client-documents/[id]/suggestions/[suggestionId]/accept` | `{}` | Accept a client suggestion |
| `POST` | `/api/v1/client-documents/[id]/suggestions/[suggestionId]/reject` | `{}` | Reject a suggestion |

### Approvals

| Method | Route | Body | Notes |
|---|---|---|---|
| `POST` | `/api/v1/client-documents/[id]/approve` | `{ actorName, mode }` | Operational approval (agent/admin) |
| `POST` | `/api/v1/client-documents/[id]/accept` | `{ typedName, checkboxText, termsSnapshot?, investmentSnapshot? }` | Formal acceptance (proposals) |

### Public (no auth)

| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/v1/public/client-documents/[shareToken]` | Public share page data (status must be `client_review`+) |

---

## Default Agent Workflow

### "Make a proposal for [Client]"

1. **Resolve org:** `GET /api/v1/organizations?search=[client_name]` → get `orgId` and `slug`
2. **Pull context:** org profile, open CRM deals, projects, wiki at `~/Cowork/Cowork/agents/partners/wiki/`
3. **Choose template:** proposal → `sales_proposal`, website/app → `build_spec`, etc.
4. **Create document:**
   ```
   POST /api/v1/client-documents
   X-Org-Id: <orgId>
   {
     "title": "[Client Name] — [Type] [Month YYYY]",
     "type": "sales_proposal",
     "templateId": "sales_proposal",
     "orgId": "<orgId>",
     "linked": { "dealId": "<dealId if known>" }
   }
   ```
5. **Create first version** with filled blocks:
   ```
   POST /api/v1/client-documents/[id]/versions
   X-Org-Id: <orgId>
   {
     "blocks": [ ...filled blocks array... ],
     "theme": {
       "brandName": "<org.name>",
       "palette": { "bg": "#0A0A0B", "text": "#F7F4EE", "accent": "#F5A623" },
       "typography": { "heading": "sans-serif", "body": "sans-serif" }
     },
     "changeSummary": "Initial agent-generated draft"
   }
   ```
   Use brand colors from org profile if available.
6. **Mark open assumptions:**
   ```
   PATCH /api/v1/client-documents/[id]
   {
     "assumptions": [
       { "id": "price", "text": "Investment amount TBC", "severity": "blocks_publish", "status": "open", "createdBy": "agent" },
       { "id": "timeline", "text": "Start date to confirm with client", "severity": "needs_review", "status": "open", "createdBy": "agent" }
     ]
   }
   ```
7. **Return to Peet:**
   - Admin URL: `https://partnersinbiz.online/admin/documents/[id]`
   - Summary of `blocks_publish` assumptions that must be resolved before you can publish
   - Never publish without Peet's explicit instruction

---

## Assumptions Guide

Use `assumptions[]` whenever context is incomplete. Severity:

| Severity | When to use |
|---|---|
| `blocks_publish` | Price, legal terms, binding dates, final scope, client name/address on contract |
| `needs_review` | Positioning copy, wording, references, estimates, optional sections |
| `info` | FYI notes that don't need action |

Always draft first. The document is safe to show Peet with open assumptions. Never publish (`POST .../publish`) without resolving all `blocks_publish` items first.

---

## Filling Blocks Well

**hero:** Write a one-line value proposition or document purpose as the subtitle. Example: `"A clear path to a faster, more discoverable web presence."`

**problem:** Describe the client's current situation and pain in 2–4 sentences. Be specific. Reference their industry, current tools, and what they're missing.

**scope:** Bullet list of what is included. Be explicit. Include tech stack, integrations, environments (staging + prod), etc.

**deliverables:** Concrete, countable outputs. "1 × Next.js website", "3 × Figma design rounds", "Monthly performance reports for 3 months".

**timeline:** Use realistic phase names: Discovery → Design → Build → QA → Launch. Include durations like "1 week", "2 weeks".

**investment:** Always in ZAR unless client is international. Include a line-item breakdown and a total. Add a `notes` field for payment schedule.

**terms:** Reference PiB standard: 50% upfront, 50% on launch. IP transfers on final payment. 30-day support post-launch.

**metrics:** For strategy docs: reach, engagement rate, follower growth, leads generated. For build docs: Lighthouse scores, Core Web Vitals, uptime.

---

## Cross-References

- **content-engine** skill creates `content_campaign_plan` documents automatically
- **project-management** skill links documents to projects via `linked.projectId`
- **crm-sales** skill links proposals to deals via `linked.dealId`
- **seo-sprint-manager** skill can link sprint reports via `linked.seoSprintId`
