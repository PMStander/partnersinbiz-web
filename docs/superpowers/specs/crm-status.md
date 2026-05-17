---
title: CRM Status — Built vs. Missing (Honest)
date: 2026-05-17
status: living document
purpose: ground-truth audit of the CRM, separating the platform layer (shipped) from the operational layer (missing)
---

# CRM Status — Built vs. Missing (Honest)

> **The product vision:** PiB does marketing/lead-gen FOR clients AND clients run their day-to-day in a fully operational CRM inside their PiB workspace. World-class comparison points: HubSpot, Pipedrive, Close.

> **Reality check (2026-05-17):** the platform layer is production-grade. The operational layer (UI surfaces, automation, dashboards, communications, calendar, reports) is largely missing. The "CRM 2.0 Bundle" shipped today added a kanban + bulk ops + saved views, but the system is still ~30% of a world-class CRM.

---

## What's actually shipped (production-grade)

### Identity, tenancy, attribution (Sub-1, tag `crm-sub1-complete`)
- `withCrmAuth(minRole)` middleware on every CRM-adjacent route (26 routes)
- `MemberRef` snapshots written on every record (`createdByRef`, `updatedByRef`, `assignedToRef`, `ownerRef`)
- Cross-tenant isolation enforced + per-resource isolation test suites with where-respecting mocks
- Permission toggles (`membersCanDeleteContacts`, `membersCanExportContacts`) wired
- `orgMembers/{orgId}_{uid}` flat collection with role + profile

### Backend CRUD shipped
| Resource | API | Notes |
|---|---|---|
| Contacts | full CRUD + tags + bulk + import + preferences | `/api/v1/crm/contacts/*` |
| Deals | full CRUD + stage webhooks + convert-to-invoice (via quotes) | `/api/v1/crm/deals/*` |
| Activities | GET + POST (no PATCH/DELETE) | `/api/v1/crm/activities/*` |
| Segments | full CRUD + preview + resolve | `/api/v1/crm/segments/*` |
| Capture-sources | full CRUD + rotateKey | `/api/v1/crm/capture-sources/*` |
| Integrations | full CRUD + sync + AES-256-GCM credential encryption | `/api/v1/crm/integrations/*` |
| Forms | full CRUD + public `/submit` with `formSubmissionRef` | `/api/v1/forms/*` |
| Quotes | full CRUD + atomic numbering + status webhooks + convert-to-invoice | `/api/v1/quotes/*` |
| Tasks | full CRUD + assign + complete + push notifications | `/api/v1/tasks/*` |
| Saved views | per-user filter presets | `/api/v1/crm/saved-views/*` |
| Email templates | full CRUD + AI generate + brand kit | `/api/v1/email-templates/*` |
| Sequences | full CRUD + branching + A/B + AI generate + goals | `/api/v1/sequences/*` |
| Sequence enrollments | full lifecycle | `/api/v1/sequence-enrollments/*` |
| SMS | inbound webhook + send | `/api/v1/sms/*` |
| Notifications | CRUD + read-all + push dispatch on task.assigned | `/api/v1/notifications/*` |
| Search | covers contacts/projects/tasks/invoices | `/api/v1/search` |
| Reports | pipeline snapshot + monthly performance PDF | `/api/v1/reports/pipeline` |

### Portal pages shipped
- `/portal/contacts` — list with filters (search/stage/type), bulk-action bar, saved views dropdown
- `/portal/contacts/[id]` — name+notes edit, recent emails (20), activity feed (50), deals panel (PR added today)
- `/portal/deals` — kanban + list toggle, drag-drop stage change, pipeline-value summary strip
- `/portal/segments` — list + builder
- `/portal/capture-sources` — list + manual import
- `/portal/capture-sources/import` — client-side CSV parse
- `/portal/enquiries/[id]` — form-submission message thread
- `/portal/email-analytics` — sequence + contact analytics
- `/portal/reports` — monthly performance reports (shareable PDFs)
- `/portal/dashboard` — basic KPI tiles (revenue, MRR, contacts count, latest report)

### Infrastructure
- Atomic Firestore counter numbering for invoices + quotes (no duplicate numbers)
- AES-256-GCM credential encryption for integrations (Mailchimp/Hubspot/Gmail)
- Form-key + rate limit + Turnstile + honeypot on public `/forms/[id]/submit`
- PWA scaffolding (sw.js, manifest, firebase-messaging-sw.js)
- 2191 tests across 314 suites, all green

---

## What's missing for a world-class operational CRM

### Critical gaps (blocks calling it a "full CRM")

#### 1. Companies / Accounts as first-class entity
- Currently: `Contact.company` is a plain string
- Missing: `companies` collection, contact→company relationships, company detail page, account-based selling features
- B2B clients (most of PiB's targets) cannot run their sales process without this

#### 2. Custom fields per workspace
- Missing: per-workspace `customFields` definitions on Contact, Deal, Company
- Without this, every client has to use PiB's hardcoded schema — nobody gets a CRM that matches THEIR domain (vehicle make/model for a dealer, club/age-group for a sports academy, treatment type for a clinic, etc.)

#### 3. Multi-pipeline support
- Currently: one global `DealStage` enum (`discovery → proposal → negotiation → won → lost`)
- Missing: `pipelineId` on deals; per-workspace pipeline configurations (Sales / Onboarding / Partnerships / Renewals); customizable stages per pipeline
- Every client team needs different pipelines — without this, the CRM is unusable for teams with multiple revenue motions

#### 4. Deal detail page
- Missing: `/portal/deals/[id]` route entirely — deals are list-only in UI
- Cannot view notes, activity log per deal, attachments, line items
- Cannot manage a deal beyond stage drag-drop

#### 5. Tasks portal UI
- Missing: `/portal/tasks` — task API is shipped but there's no list view in the portal
- Cannot see "what's due today", "my overdue tasks", "tasks by deal"
- Without this, tasks are an API feature with no consumer

#### 6. Inline email/SMS compose from contact page
- Missing: "Send email" button, compose modal, template insertion
- Missing: "Send SMS" button
- The contact detail page is read-only — cannot reach out to a contact from inside the CRM

#### 7. Inbound email thread sync
- Missing: Gmail integration only imports contacts, not their email threads
- Without inbound sync, the CRM loses ~60% of customer-interaction history

#### 8. Sequence auto-triggers
- Sequences and enrollment APIs ship
- Missing: triggers (stage change → enroll, tag added → enroll, form submitted → enroll)
- Without triggers, every enrollment is manual — CRM becomes a glorified email-blast tool

#### 9. Calendar / meetings
- Entirely missing — no calendar UI, no Calendly-style booking, no meeting outcome capture
- Without meeting tracking, the activity log misses the most important sales interactions

#### 10. Lead routing + scoring
- Missing: routing rules (auto-assign new lead by territory/criteria)
- Missing: stored lead score on Contact (formula exists in `lib/crm/segments.ts` but never materialized)
- Missing: ICP fit score
- New leads pile up unassigned; reps have no signal of which to call first

### Important gaps (without these, the CRM feels half-built)

#### 11. Workflow builder UI
- Sequences API supports branching + A/B + goals
- Missing: visual workflow editor — currently sequences are admin-API-only
- Without this, only Pip-the-agent can create sequences; clients can't self-serve

#### 12. CRM dashboard
- `/portal/dashboard` exists but shows generic KPIs (revenue, MRR)
- Missing: CRM-specific widgets — deals at risk, tasks due today, recent activity feed, pipeline-value-by-stage, hot leads
- The first page a user lands on after login doesn't show them what to do today

#### 13. Reports beyond pipeline snapshot
- Have: pipeline snapshot (count + value per stage)
- Missing: conversion funnel (lead → contact → deal → won)
- Missing: pipeline velocity (avg time-in-stage)
- Missing: revenue forecast (weighted pipeline)
- Missing: rep performance dashboard
- Missing: activity reports (meetings/calls/emails per period)
- Missing: custom report builder

#### 14. Unified org-scoped CRM search
- `/api/v1/search` covers contacts/projects/tasks/invoices but NOT deals, quotes, segments, sequences, templates
- Search is also not org-scoped (reads first 200 docs unscoped) — security gap
- Sales rep searching "ACME" should find the company, the deal, the contact, the open quote, the recent activity — currently they find none of those except the contact

#### 15. In-app notification center UI
- Notifications API exists + push notifications wired for task.assigned
- Missing: bell icon + notification panel UI in portal header
- Missing: CRM-specific notification types (deal.stage_changed, quote.accepted, lead.assigned, task.due-soon)
- Missing: per-event subscription UI

#### 16. Lifecycle automation
- Contact has lifecycle stages (lead/prospect/customer/churned)
- Missing: automatic transitions (e.g. "promote to customer when deal.won")
- Missing: customer health score
- Missing: churn warning signals

### Polish gaps (table stakes for a world-class product)

#### 17. CSV import wizard with column mapping
- Currently: client-side parse + auto-header-normalize
- Missing: 3-step wizard (upload → map columns → preview → import)
- Importing existing CRM data is the #1 onboarding step — currently it's a black box

#### 18. New-client CRM setup wizard
- Missing: first-time login flow that asks: "What do you sell? What's your sales process? Import contacts? Connect Gmail?"
- Without this, every new client is dropped into an empty CRM with no guidance

#### 19. Starter templates
- Missing: pre-built pipelines (B2B Sales, Onboarding, Partnerships), pre-built sequences (welcome series, demo follow-up, win-back), pre-built segments, pre-built forms
- Every workspace starts from zero

#### 20. Row-level permissions
- Have: role-based (owner/admin/member/viewer)
- Missing: "reps only see their own deals/contacts" mode
- Missing: deal-level sharing
- Important for larger teams + privacy-sensitive clients

#### 21. CRM-specific mobile views
- PWA infrastructure is shipped but no responsive review for CRM pages
- Reps on the road need a mobile contact lookup + log-a-call flow

#### 22. AI surfaces beyond contact brief
- `/api/v1/ai/contact-brief/[id]` exists but is admin-only and unsurfaced
- Missing: AI-suggested next actions per contact/deal
- Missing: AI deal insights (risk, forecast)
- Missing: AI email drafts from contact page
- Missing: AI lead scoring

#### 23. Webhooks documentation + portal-side subscription UI
- Outbound webhooks exist + signature-verified delivery
- Missing: complete event catalog, payload examples, portal UI to subscribe to events (only admin-side today)

---

## What this is honestly comparable to today

| Layer | PiB CRM today | HubSpot equivalent |
|---|---|---|
| Tenancy + auth | ✅ Production-grade | ✅ |
| Contact CRUD | ✅ Solid | ✅ |
| Deal CRUD + kanban | ✅ Basic | ✅ |
| Tasks API | ✅ | ✅ |
| Tasks UI | ❌ | ✅ |
| Companies | ❌ | ✅ |
| Custom fields | ❌ | ✅ |
| Multi-pipeline | ❌ | ✅ |
| Email compose | ❌ | ✅ |
| Email sync | ❌ | ✅ |
| Sequences | ✅ API | ✅ API + UI |
| Sequence triggers | ❌ | ✅ |
| Workflow builder | ❌ | ✅ |
| Calendar/meetings | ❌ | ✅ |
| Reports | ❌ (only snapshot + monthly PDF) | ✅ |
| Search | Partial | ✅ |
| AI brief | ✅ (admin-only) | Partial |
| Mobile | ❌ | ✅ |
| Lead routing/scoring | ❌ | ✅ |
| Onboarding wizard | ❌ | ✅ |

**Verdict:** the codebase is HubSpot-grade in terms of architecture and tenant safety. As a product experience, it's at maybe 30% of HubSpot.

---

## What's needed to close the gap

See: [[crm-world-class-roadmap]]

The roadmap breaks the missing 70% into 6 sub-programs that can be executed in order or in parallel where dependencies allow.

## Production state

| Metric | Value |
|---|---|
| Tests | 2191 / 314 suites / 0 failures |
| Routes migrated to `withCrmAuth` | 26 |
| Production contacts | 168 (mostly imported, attributed as "Imported") |
| Production deals | 0 |
| Production quotes | 0 |
| Production segments | 0 |
| Production forms | 0 |
| Firebase indexes deployed | Yes (`partners-in-biz-85059`, 2026-05-17 15:14 UTC) |
| Backfill | Committed (453 records) |

**Translation:** the platform is shipped, indexes deployed, backfill committed. The CRM has no real workflows running through it yet. The next agent has a clean foundation to extend on.
