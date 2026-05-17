---
title: CRM World-Class Roadmap — 6 sub-programs to close the gap
date: 2026-05-17
status: master plan
purpose: detailed roadmap from "platform layer shipped" to "world-class operational CRM ready for client production use"
prerequisites: read [[crm-status]] first
---

# CRM World-Class Roadmap

> The platform layer is done (tenant safety, attribution, CRUD, 26 routes on `withCrmAuth`). What remains is the operational layer: data model expansion, UI completeness, automation, communication, reports, polish. This document breaks that into 6 sub-programs, each with its own scope, dependencies, and estimated complexity.

> Programs A and B are foundational and must ship first. C–F can be parallelized depending on agent capacity.

---

## Sub-program A — Core data model expansion (FOUNDATIONAL)

**Why first:** every UI surface and every automation depends on the data model. Custom fields and Companies are the biggest holes; expanding the data model now avoids breaking-changes later.

### A1. Companies / Accounts as first-class entity
- New `companies/{id}` collection — `orgId`, `name`, `domain`, `industry`, `size`, `address`, `customFields`, attribution
- New API: `/api/v1/crm/companies/*` (CRUD + bulk + isolation tests)
- Contact model: replace `company: string` with `companyId?: string` + optional `companyName` cache
- Migration: best-effort match contacts to companies by `company` string + manual review UI
- Activity log entries gain `companyId` when applicable
- Deals + Quotes gain `companyId`
- Portal page: `/portal/companies` list + `/portal/companies/[id]` detail
- Contact detail page: show linked company + jump-to-company link
- Search: companies indexed

### A2. Custom fields per workspace
- New collection or org settings sub-object: `customFieldDefinitions/{orgId}_{resource}` where `resource` ∈ `contact|deal|company`
- Field types: text, number, date, dropdown (with options), checkbox, multi-select
- Per-field metadata: label, required, default, group, order
- API: `/api/v1/crm/custom-fields/*` CRUD
- Generic `customFields: Record<string, unknown>` map on Contact/Deal/Company records
- UI: settings page to define fields, contact/deal/company forms render dynamic fields
- Validation: enforce required + type on writes
- Search/filter: searchable by custom fields

### A3. Multi-pipeline support
- New `pipelines/{id}` collection — `orgId`, `name`, `description`, `stages: [{ id, label, order, probability, color }]`, `isDefault`, `archived`
- New API: `/api/v1/crm/pipelines/*` CRUD + stages management
- Deal model: `pipelineId: string` (required, defaults to `defaultPipelineId`)
- Migration: create one default "Sales" pipeline per org, set on all existing deals
- Kanban + list pages: pipeline selector dropdown above board
- Stage transitions still fire webhooks; `deal.stage_changed` payload gains `pipelineId`
- Reports + dashboards: filter by pipelineId

### A4. Lead score + ICP score (stored fields)
- `Contact.leadScore: number` (0-100) — formula based on email engagement (already in `lib/crm/segments.ts`) + behavioral signals + lifecycle
- `Contact.icpScore: number` (0-100) — formula based on company industry/size/location vs. workspace's ICP definition
- Per-workspace ICP definition stored in org settings: ideal industries, sizes, regions
- Nightly cron updates scores (Cloud Function or Vercel cron)
- New endpoint: `POST /api/v1/crm/contacts/[id]/recompute-score` for manual refresh
- Surface on contact list + detail (score chip with color gradient)

### A5. Deal probability + lost-reason + line items
- Deal model: `probability: number` (auto-set per stage from pipeline definition, overridable)
- Deal model: `lostReason?: string` (free text or enum from workspace settings)
- Deal model: `lineItems?: Array<{ name, quantity, unitPrice, discount, total }>` for product-line tracking
- Quote conversion: line items roll into quote
- Reports gain weighted-pipeline value (sum of value × probability)

### A6. Lifecycle automation triggers
- Auto-promote contact lifecycle: `stage = 'won'` deal → contact.type = `'customer'`; `stage = 'lost'` after N days → `'churned'`
- Customer health score on Contact (engagement + last activity recency + deal status)
- Churn warning signal flag (low engagement + no recent activity)

**Effort estimate:** ~3-4 weeks of focused work. 6 PRs.

---

## Sub-program B — UI completeness (high user impact)

**Why second:** the portal needs to render the new data and the existing endpoints. Tasks UI, deal detail page, companies UI, custom-field forms.

### B1. Deal detail page (`/portal/deals/[id]`)
- Full deal view: title, value, currency, stage chip, owner, contact link, company link, line items, probability, expected close
- Tabs/sections: Activities, Notes, Tasks, Quotes, Documents
- "Move stage" button + drag-drop on the kanban
- Inline owner change, line-items editor
- Convert-to-invoice button (already wired API-side)

### B2. Tasks portal UI (`/portal/tasks`)
- Three views: list, board (by status: open/in-progress/done), calendar
- Filters: assignee, priority, due range, related-to (contact/deal/company)
- Quick-add task from any contact/deal page (drawer or modal)
- Overdue badge, due-today badge
- Bulk complete/reassign

### B3. Companies portal UI (`/portal/companies` + `/portal/companies/[id]`)
- List with filters (industry, size, deal count, last activity)
- Detail page: company info, linked contacts, open deals, recent activity, notes
- Edit company + custom fields
- Merge companies (parallel to contact merge in Sub-program A)

### B4. Contact detail page upgrades
- Render `companyId` link + company info card
- Render `leadScore` + `icpScore` chips
- Render custom fields section
- Send Email button → compose modal (depends on Sub-program D)
- Send SMS button → compose modal (depends on Sub-program D)
- Schedule meeting button (depends on Sub-program D)
- Surface AI brief inline (not admin-only — viewer can request brief)
- Tasks panel showing open + completed tasks for this contact

### B5. Sequences portal UI (`/portal/sequences`)
- List view: name, status (draft/active/paused), enrolled count, open rate, click rate, replied count
- Detail view: visual step editor (linear with branching)
- Trigger configuration UI (stage-change, tag-added, form-submitted, manual)
- Enrollment status: who's in, where they are, when next message fires
- Pause/resume/clone

### B6. CRM dashboard widget overhaul (`/portal/dashboard` or new `/portal/crm`)
- Hot leads (highest score, recent activity)
- Deals at risk (overdue close date, no activity in N days)
- Tasks due today + overdue
- Recent activity feed (mixed: contacts created, deals moved, forms submitted, calls logged)
- Pipeline value by stage chart
- Monthly KPI tile (new contacts, new deals, won value, conversion rate)

### B7. Workflow builder UI (`/portal/workflows`)
- Visual editor for sequences: drag steps, configure delays + conditions + branches
- Trigger panel: "When X happens..." (stage change, tag added, form submitted, time-based)
- Action panel: "Do Y..." (send email, send SMS, add tag, assign task, change stage, enroll in sequence)
- Test mode: dry-run a workflow against a sample contact

**Effort estimate:** ~4-5 weeks. 7 PRs.

---

## Sub-program C — Automation & intelligence

**Why third:** with data model + UI in place, automation makes the CRM proactive instead of reactive.

### C1. Sequence auto-triggers
- New `automation_rules/{id}` collection — `orgId`, `trigger: { kind, criteria }`, `action: { kind, target }`, `enabled`
- Trigger kinds: `stage_changed`, `tag_added`, `tag_removed`, `form_submitted`, `lifecycle_changed`, `score_threshold_crossed`
- Action kinds: `enroll_in_sequence`, `add_tag`, `assign_task`, `notify_owner`, `update_stage`, `send_email`, `send_sms`
- Server: each webhook handler checks automation_rules + fires matching actions
- UI: integrated into Workflow builder (Sub-program B7)
- Tests: simulate every trigger × action combo

### C2. Lead routing rules
- `lead_routing_rules/{id}` — `orgId`, `criteria: { stage?, source?, tagsAny?, scoreMin? }`, `assignTo: uid | 'round-robin' | 'team:{teamId}'`, `enabled`, `order`
- New leads (contact created from form/import/API): pass through ordered rules, first match wins
- Round-robin: track last-assigned uid per rule, rotate
- Reports: routing effectiveness (which rules fire most, leads assigned per rep)

### C3. Auto-tagging by behavior
- Behavioral tag rules: when contact opens N emails / clicks specific links / visits page X / submits form Y, add tag Z
- Hooks into existing email-analytics pipeline + analytics SDK
- UI: rule editor inside the segments/automation page

### C4. AI deal insights
- Endpoint: `GET /api/v1/ai/deal-insights/[dealId]` — analyzes deal age, activity recency, contact engagement, stage history; returns risk score + suggested next action
- Surfaced on deal detail page (Sub-program B1)
- Caches result for 24h
- Configurable via workspace AI settings

### C5. AI next-action suggestions
- Endpoint: `GET /api/v1/ai/next-actions/[contactId]` — suggests 1-3 concrete actions based on context (e.g. "send follow-up email", "schedule demo", "log a call")
- Surfaced on contact detail page (under AI brief)
- One-click to execute (send email opens compose with AI draft)

### C6. AI email drafts
- Endpoint: `POST /api/v1/ai/email-draft` — body `{ contactId, intent: 'follow-up'|'demo-request'|'check-in'|'closing'|custom }`, returns subject + body
- Surfaced in email compose modal (Sub-program D1)
- Inserts brand voice from `brand-kit` per workspace

### C7. AI lead scoring (replaces formula-based A4)
- Endpoint: `POST /api/v1/ai/score-leads` (batch, nightly cron)
- Uses LLM to weigh engagement + ICP fit + behavioral signals
- Stored as `Contact.aiLeadScore` alongside `leadScore` formula score
- Surfaced as gradient chip on contact list

**Effort estimate:** ~3-4 weeks. 5-6 PRs.

---

## Sub-program D — Communication hub

**Why fourth:** with the data + UI + automation in place, the CRM needs to be where reps DO their work.

### D1. Inline email compose from contact page
- "Send email" button → modal with: to (from contact email), subject, body (rich text), template picker, attachment upload
- Per-workspace from-address validation (e.g. `noreply@<workspace-domain>`)
- Send via Resend API (existing `lib/email/*`)
- Save sent email to `email_messages` collection + write activity entry on contact
- Track open + click via existing email-analytics pipeline

### D2. Inbound email thread sync (Gmail)
- Extend Gmail integration to pull email threads matching workspace's connected addresses
- Match by recipient email → find contact → attach thread to contact
- Two-way: replies via Gmail surface in CRM
- Webhook from Gmail push notifications for real-time sync (vs polling)

### D3. Inline SMS compose
- "Send SMS" button → modal with phone + body
- Send via Twilio API (existing `lib/sms/twilio.ts`)
- Save sent message + log activity
- Track delivery status via Twilio webhook

### D4. WhatsApp messaging
- New `lib/whatsapp/*` adapter (Twilio WhatsApp API or Meta Cloud API)
- Compose modal + inbound webhook → activity log

### D5. Calendar integration + meeting booking
- Calendar events linked to contacts/deals (existing `/api/v1/calendar/events` extended)
- "Schedule meeting" button on contact detail → in-app booking flow (pick available slot, send invite)
- Inbound: Google Calendar / Outlook sync via OAuth
- Meeting outcome: post-meeting prompt to log outcome + auto-create activity

### D6. Calendly-style public booking page
- Public route: `/book/[orgSlug]/[scheduleId]` — visitor picks a slot from rep's availability
- Auto-creates contact + activity + calendar event
- Email confirmation + reminders
- Per-rep availability config in workspace settings

### D7. Unified communication timeline
- Contact detail page activity feed: merge email + SMS + WhatsApp + call logs + meeting summaries + form submissions in one chronological stream
- Filter by communication type
- "Reply" button on any incoming message → opens compose

**Effort estimate:** ~5-6 weeks. 7 PRs.

---

## Sub-program E — Reports & analytics

**Why fifth:** with data flowing through the system, reports give the leadership view.

### E1. Conversion funnel
- `GET /api/v1/reports/funnel` — counts at each lifecycle stage (lead → contact → prospect → customer)
- Per-period (month/quarter/year)
- Per-source breakdown
- Visualization: classic funnel chart

### E2. Pipeline velocity / time-in-stage
- `GET /api/v1/reports/pipeline-velocity` — avg days per stage, bottleneck flag
- Computed from `deal.stageHistory` (new field — tracks every stage transition with timestamp)
- Trend over time

### E3. Revenue forecast
- `GET /api/v1/reports/forecast` — weighted pipeline value = sum(deal.value × stage.probability)
- Per pipeline, per close-date period (this quarter, next quarter)
- Best/likely/worst-case scenarios

### E4. Rep performance dashboard
- `GET /api/v1/reports/rep-performance` — per-rep: deals won, value, conversion rate, activities logged, meetings, calls, emails sent
- Leaderboard view
- Filter by period

### E5. Activity reports
- `GET /api/v1/reports/activities` — meetings/calls/emails/notes per period, per rep
- Workspace-level rollups + per-rep drilldown

### E6. Custom report builder
- UI: drag fields, choose chart type, save report
- Stored as `reports/{id}` collection
- Shareable + scheduled email (weekly digest)

**Effort estimate:** ~3 weeks. 5 PRs.

---

## Sub-program F — Onboarding & polish

**Why last:** these are necessary for real client use but depend on everything else being in place.

### F1. New-client CRM setup wizard
- First-time login flow: "What do you sell? What's your sales process? Import contacts? Connect Gmail? Set up your pipeline?"
- 5-step wizard with skip-each-step option
- Stores progress in `orgMembers.crmOnboarding` field
- Resumable

### F2. CSV import wizard with column mapping
- 3-step: upload → map columns (drag-drop or auto-suggest) → preview (5 rows) → import
- Handles duplicates: skip/update/merge
- Per-import report (created/updated/skipped/failed) emailed to importer

### F3. Starter templates library
- Pre-built pipelines: B2B Sales, Onboarding, Partnerships, Renewals, Recruitment, Real Estate
- Pre-built sequences: Welcome (3-step), Demo Follow-up (5-step), Win-back (4-step), Cold Outreach (7-step)
- Pre-built segments: Hot Leads, At-Risk Customers, Reactivation Targets
- Pre-built forms: Contact Us, Demo Request, Newsletter Signup, Quote Request
- One-click apply

### F4. In-app notification center UI
- Bell icon in portal header
- Dropdown panel: unread count badge, recent 20 notifications, mark-all-read, jump-to-resource
- Real-time updates via Firestore listener
- Per-event subscription preferences UI

### F5. CRM-specific mobile views
- Responsive review of every CRM page (contacts, deals, tasks, dashboard)
- Mobile-first card layouts (vs table)
- Touch-optimized drag-drop on kanban
- PWA install prompt for CRM-heavy users

### F6. Row-level permissions
- `Deal.visibility` field: `'org' | 'owner-only' | 'team:{teamId}'`
- API enforces visibility check on read/write
- UI: visibility chip + change-visibility action
- Aggregate views (dashboard, reports) respect visibility

### F7. Webhook event catalog + portal subscription UI
- `/portal/settings/webhooks` page: list webhooks, add new, payload examples per event, test webhook
- Event catalog endpoint: `GET /api/v1/webhooks/event-catalog` returning all available events + schemas

**Effort estimate:** ~3-4 weeks. 5-6 PRs.

---

## Total scope

| Program | PRs | Estimated weeks | Dependencies |
|---|---:|---:|---|
| A. Data model expansion | 6 | 3-4 | (none — starts here) |
| B. UI completeness | 7 | 4-5 | A |
| C. Automation & intelligence | 5-6 | 3-4 | A, partial B |
| D. Communication hub | 7 | 5-6 | A, B |
| E. Reports & analytics | 5 | 3 | A |
| F. Onboarding & polish | 5-6 | 3-4 | A, B, partial C, D |
| **Total** | **~35-37 PRs** | **~21-26 weeks** | sequenced or parallelized per agent capacity |

With aggressive subagent parallelism (5+ agents in parallel where dependencies allow), this can compress to **8-12 weeks** of calendar time.

---

## Recommended execution order

### Phase 1 (foundation) — 4 weeks
Sub-program A in full. Without companies + custom fields + multi-pipeline + scoring, every later feature has to be retrofitted.

### Phase 2 (visibility + workflow) — 6 weeks
Sub-program B (UI completeness) + start C (automation) in parallel after Sub-program A is done.

### Phase 3 (operationalize) — 4 weeks
Sub-program D (communication hub) + finish C + start E (reports) in parallel.

### Phase 4 (polish + ready-for-clients) — 4 weeks
Sub-program F (onboarding + mobile + permissions) + finish E.

### Phase 5 (dogfood + iterate) — 2 weeks
Real client onboarding. Bug fixes. Polish. Documentation.

**Total calendar time:** ~20 weeks with one dedicated agent + parallel subagents.

---

## Quality bar (non-negotiable)

Every PR must meet the Sub-1 standards:
1. `withCrmAuth(minRole)` on every route (or `withCrmAuth('admin')` for admin-only)
2. `MemberRef` attribution on every record write
3. Tenant isolation 404 on cross-org access
4. Empty-body guards on PUT/PATCH
5. Best-effort side effects wrapped in try/catch
6. Where-respecting isolation mocks in tests
7. Distinct UIDs in tests (no substring collisions)
8. `{ ...data, id }` spread order
9. `loadResource(id, orgId)` helper for [id] routes (with deleted check)
10. Sanitize undefined before Firestore writes
11. Build clean + full suite green before push
12. Skill docs updated for any role changes

If a PR doesn't meet the bar: rework before merging. The platform standard is non-negotiable for production-grade multi-tenant CRM.

---

## Next step

Read [[crm-status]] for the honest gap analysis, then [[crm-handoff-prompt]] for the agent briefing.
