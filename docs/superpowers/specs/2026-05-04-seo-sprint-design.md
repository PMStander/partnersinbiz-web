# SEO Sprint Manager — Design Spec

**Date:** 2026-05-04
**Author:** Pip + Peet
**Status:** Draft → ready for review
**Module:** `seo-sprint-manager` (ninth skill)

## Goal

Add SEO tools to the platform alongside the existing Social tools. The unit is a 90-day SEO sprint per client site, modelled after the Outrank 90-Day SEO Sprint Tracker (42 tasks across phases 0–3) but extended into an open-ended Phase 4 ("Compounding") so SEO can continue indefinitely.

The sprint is **agent-driven**: Pip checks each sprint's state, executes today's work where autopilot allows, escalates blockers, and continuously evaluates whether the plan is working — mutating it when it isn't (Karpathy autoresearch loop applied to SEO).

## Decisions made during brainstorming

| # | Question | Decision |
|---|---|---|
| Q1 | Sprint granularity | One sprint per site. A client with 3 sites has 3 sprints. |
| Q2 | What "do today's SEO" does | Default `safe`: Pip auto-executes anything that produces a draft; queues anything that publishes/posts for human review. Per-sprint `full` autopilot toggle for trusted sites. `off` mode = drafts + approval. |
| Q3 | Real data vs manual entry | Selective integrations: Google Search Console (impressions, clicks, position, indexing) + PageSpeed Insights (Core Web Vitals). Everything else manual. Per-sprint integration toggles — graceful when not configured. |
| Q4 | Task template rigidity | Template seeds, sprint owns its tasks. The 42 Outrank tasks copy into each sprint as editable instances. |
| Q5 | Where it lives | `/admin/seo` (cockpit) + `/portal/seo` (client-facing read-mostly view). Mirrors the social tools split. |
| — | Paid-tool replacements | Build our own toolkit instead of linking out to Outrank. Ahrefs/Moz/SEMrush replaced with free official APIs (Bing Webmaster Tools, OpenPageRank, Common Crawl) plus our own crawlers. |

## Architecture

### Module shape (mirrors `social/`)

```
app/(admin)/admin/seo/                  internal cockpit
  page.tsx                               (all sprints across clients)
  sprints/[id]/                          single sprint cockpit (tabbed)
  tools/                                 in-house SEO toolkit ad-hoc UI

app/(portal)/portal/seo/                client-facing read view
  page.tsx                               their sprints
  sprints/[id]/                          progress + performance + pages + blog + audits

app/api/v1/seo/                         REST API consumed by the skill
  sprints/, tasks/, keywords/, backlinks/,
  content/, audits/, optimizations/, tools/, integrations/

app/api/cron/seo-daily/                 daily Loop A (06:00 SAST)
app/api/cron/seo-weekly/                weekly Loop C (Mondays 07:00 SAST)

lib/seo/
  templates/outrank-90.ts                versioned template definition
  tools/                                 in-house toolkit implementations
  integrations/gsc/                      GSC adapter
  integrations/bing/                     Bing WMT adapter
  integrations/pagespeed/                PageSpeed adapter
  integrations/openpagerank/             OPR adapter
  integrations/commoncrawl/              Common Crawl adapter
  loops/daily.ts                         Loop A logic
  loops/execution.ts                     Loop B logic
  loops/optimization.ts                  Loop C logic + detectors

partnersinbiz-web/.claude/skills/seo-sprint-manager/SKILL.md
```

### Three loops

**Loop A — Daily refresh (cron, no human, 06:00 SAST)**
For each sprint with `status in ('pre-launch','active','compounding')`:
1. Pull GSC for last 7 days (per page + per query)
2. Pull PageSpeed for homepage + 3 rotating tracked pages
3. Pull Bing WMT for backlink updates (where connected)
4. Update `seo_keywords`, `seo_content[].performance`, page health
5. Recompute `currentDay`, `currentWeek`, `currentPhase`
6. Build denormalised "today's plan" doc
7. Compute health signals; flag anything high severity to inbox

**Loop B — Execution (you trigger via Pip)**
You ask Pip to "do today's SEO" for one or all sprints:
1. Skill reads `today's plan`
2. For each task: autopilot-execute if eligible + sprint mode allows; otherwise queue + escalate
3. Hand off to `social-media-manager` skill for "repurpose to LI/X" subtasks
4. End with a digest

**Loop C — Optimization / Karpathy autoresearch (weekly + on-demand)**
1. Run signal detectors (see Optimization detectors below)
2. For each signal, form hypothesis(es); pick one (later: weighted by past win rate)
3. Generate `seo_tasks` rows tagged `source: 'optimization'` with `parentOptimizationId`
4. Schedule outcome measurement 14 days post-completion
5. On measure: compare GSC delta vs snapshot; mark `result: win | no-change | loss`
6. Update site-specific scoreboard; bias future hypothesis selection

### Sprint lifecycle

- **Phase 0 — Pre-launch (Day 0):** technical foundation
- **Phase 1 — Foundation (Days 1–30):** tech audit + keyword research + core pages
- **Phase 2 — Content engine (Days 31–60):** publish posts, pillar, pSEO, first backlinks
- **Phase 3 — Authority (Days 61–90):** rerun pages 8–22, build clusters, day 90 audit
- **Phase 4 — Compounding (Day 91+, ongoing):** Loop A continues daily, Loop C generates work weekly, Loop B runs on-demand. Sprint stays `active` until archived.

## Data model

Seven Firestore collections, all `orgId`-scoped (existing tenancy pattern).

### `seo_sprints`

```
{
  id, orgId, clientId,
  siteUrl, siteName,                     // sprint owns its site identity (no separate sites collection in v1)
  startDate, currentDay, currentWeek, currentPhase,
  status: 'pre-launch' | 'active' | 'compounding' | 'paused' | 'archived',
  templateId,                            // 'outrank-90' for v1
  autopilotMode: 'off' | 'safe' | 'full',
  autopilotTaskTypes: string[],          // explicit allowlist of types Pip can autopilot
  integrations: {
    gsc:       { connected, propertyUrl, lastPullAt, scopes, tokenStatus },
    bing:      { connected, siteUrl, lastPullAt, tokenStatus },
    pagespeed: { enabled, lastPullAt }
  },
  todayPlan: {                           // denormalised "today's plan", refreshed by Loop A; stored inline for fast read
    asOf, currentDay, currentWeek,
    due:        [taskId, ...],
    inProgress: [taskId, ...],
    blocked:    [{ taskId, reason }, ...],
    optimizationProposals: [optimizationId, ...]
  },
  health: { score, signals: [...] },     // refreshed daily
  scoreboard: {                          // per-hypothesis-type win-rate (Loop C)
    [hypothesisType]: { wins, losses, noChange }
  },
  createdAt, createdBy, updatedAt, lastActor
}
```

### `seo_tasks`

```
{
  id, sprintId, orgId,
  week, phase, focus, title, description,
  internalToolUrl,                       // points to our in-house tool, not Outrank
  externalReferenceUrl,                  // optional Outrank ref kept in notes
  status: 'not_started' | 'in_progress' | 'blocked' | 'done' | 'skipped' | 'na',
  source: 'template' | 'manual' | 'optimization',
  parentOptimizationId,
  taskType: string,                      // e.g. 'meta-tag-draft', 'directory-submission' — matches autopilotTaskTypes
  autopilotEligible: boolean,
  assignee: { type: 'user'|'agent', id },
  outputArtifactId,                      // points to draft post / generated meta tag / audit doc
  blockerReason,
  dueAt, completedAt, completedBy, lastActor
}
```

### `seo_keywords`

```
{
  id, sprintId, orgId,
  keyword, volume, topThreeDR, intentBucket: 'problem'|'solution'|'brand',
  targetPageUrl,
  positions: [{ pulledAt, position, source: 'gsc'|'manual', impressions, clicks, ctr }],
  currentPosition, currentImpressions, currentClicks, currentCtr,
  status: 'not_yet'|'in_progress'|'ranking'|'top_10'|'top_3'|'lost',
  retiredAt
}
```

### `seo_backlinks`

```
{
  id, sprintId, orgId,
  source, domain, type: 'directory'|'community'|'guest_post'|'link_trade'|'organic',
  theirDR,                               // from OpenPageRank
  status: 'not_started'|'submitted'|'live'|'rejected'|'lost',
  submittedAt, liveAt, url, notes,
  linkedSocialPostId,                    // when community submission triggered a social post
  discoveredVia: 'manual'|'bing-wmt'|'common-crawl'|'gsc-links'
}
```

### `seo_content`

```
{
  id, sprintId, orgId,
  publishDate, title, type: 'comparison'|'use-case'|'pillar'|'cluster'|'how-to'|'alternative',
  targetKeywordId, targetUrl,
  status: 'idea'|'drafting'|'review'|'scheduled'|'live',
  draftPostId,                           // points to insights blog post or external content
  liUrl, xUrl,
  internalLinksAdded: boolean,
  performance: { impressions, clicks, position, lastPulledAt }
}
```

### `seo_audits`

```
{
  id, sprintId, orgId, snapshotDay,      // 1, 30, 60, 90, then monthly in Phase 4
  capturedAt,
  traffic:   { impressions, clicks, ctr, avgPosition },
  rankings:  { top100, top10, top3 },
  authority: { dr, referringDomains, totalBacklinks },
  content:   { pagesIndexed, postsPublished, comparisonPagesLive },
  source: 'gsc'|'manual'|'mixed',
  publicShareToken,                      // for client-shareable URL
  pdfUrl
}
```

### `seo_optimizations`

```
{
  id, sprintId, orgId,
  detectedAt,
  signal: { type, severity: 'low'|'medium'|'high', evidence: {...} },
  hypothesis,                            // text
  hypothesisType,                        // categorical, feeds scoreboard
  proposedAction,                        // text
  generatedTaskIds: string[],
  status: 'proposed'|'approved'|'in_progress'|'applied'|'rejected'|'measured',
  outcomeMeasureScheduledFor,            // applied + 14d
  baselineSnapshot: {...},               // metrics at proposal time
  outcomeMeasuredAt, outcomeDelta: { positionChange, impressionsChange, clicksChange },
  result: 'win'|'no-change'|'loss',
  notes
}
```

### Sub-collection: `seo_sprints/{id}/page_health/{pageUrl}`

```
{
  url, lcp, cls, inp,
  performance, seo, accessibility, bestPractices,
  lastPulledAt
}
```

## Optimization detectors (initial set)

| Detector | Triggers when |
|---|---|
| `stuck_page` | Page ranking position 8–22 for ≥ 3 consecutive weeks with no improvement |
| `lost_keyword` | Keyword dropped 5+ positions WoW |
| `zero_impression_post` | Content live ≥ 14 days, < 5 impressions |
| `unindexed_page` | Core page not in GSC index after week 2 |
| `directory_silence` | Backlink submission > 30 days old, still `submitted` |
| `cwv_regression` | LCP > 2.5s OR CLS > 0.1 on a tracked page |
| `keyword_misalignment` | Page ranks for queries that don't match its target keyword |
| `pillar_orphan` | Pillar post has < 3 internal links pointing to it |
| `compound_stagnation` | (Phase 4 only) Weekly impressions flat for 4+ weeks |

Each detector → 1–3 hypothesis templates → 1+ generated tasks → 14-day measurement.

**Cap:** first 4 weeks of a sprint, max 2 optimization tasks/week. After week 4, scale with sprint health.

## Integrations

### Google Search Console (per-sprint OAuth)
- **Adapter:** `lib/seo/integrations/gsc/`
- **Scope:** `https://www.googleapis.com/auth/webmasters.readonly`
- **Pulls daily:** `searchanalytics.query` (last 7d, dimensions [page, query]); `urlInspection.index` for tracked pages; `sitemaps.list` weekly
- **Token storage:** encrypted in `seo_sprints[].integrations.gsc.tokens` using existing KMS pattern (same as social OAuth tokens)
- **Failure mode:** when token revoked/expired, daily cron writes "Reconnect GSC" task to inbox

### Bing Webmaster Tools (per-sprint, free, official API)
- **Adapter:** `lib/seo/integrations/bing/`
- **Replaces:** Ahrefs/SEMrush for backlink data on sites we control
- **Pulls daily:** inbound backlinks, query performance
- **Setup:** user verifies site in Bing UI; we connect via API after

### PageSpeed Insights (no auth, free)
- **Adapter:** `lib/seo/integrations/pagespeed/`
- **Endpoint:** `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`
- **Optional API key** (`PAGESPEED_API_KEY`) raises quota from 25/day → 25K/day
- **Pulls daily:** homepage + 3 rotating tracked pages

### OpenPageRank (free, 1K req/day)
- **Adapter:** `lib/seo/integrations/openpagerank/`
- **Replaces:** Ahrefs DR for backlink-source ranking
- **Use:** on-demand when discovering or evaluating backlink targets

### Common Crawl (free dataset, fallback only)
- **Adapter:** `lib/seo/integrations/commoncrawl/`
- **Use:** backlink discovery on domains we don't control via Bing WMT
- **Caveat:** indexes lag by weeks; not real-time

## In-house SEO toolkit

All at `lib/seo/tools/` and exposed at `/api/v1/seo/tools/*` + `/admin/seo/tools` UI.

**Tier 1 — pure code:**

| Tool | What it does |
|---|---|
| `metadata-check` | Title/description/OG/Twitter card audit per page |
| `robots-check` | Validate robots.txt, flag accidental blocks |
| `sitemap-check` | Validate sitemap.xml, count URLs, spot-check 404s |
| `canonical-check` | Audit canonicals across a site |
| `crawler-sim` | Server-side render like Googlebot, show what's indexable |
| `schema-validate` | Validate JSON-LD against schema.org |
| `title-generate` | AI title generator (existing AI endpoint) |
| `meta-generate` | AI meta description generator |
| `slug-generate` | URL slug generator |
| `keyword-density` | Term frequency analyser |
| `keyword-discover` | Combines GSC opportunities + Google Autocomplete + Wikipedia related + competitor page extraction |
| `internal-link-audit` | Find orphans, score link equity from sitemap |
| `seo-roi` | Project organic value from keyword volume + CR |

**Tier 2 — uses free APIs:** Bing WMT (backlinks), OpenPageRank (DR proxy), Common Crawl (backlink discovery on external domains).

**Tier 3 — keyword research:** combines GSC opportunities + Google Autocomplete + Wikipedia related-topics + competitor page extraction with our own scoring.

## UI surfaces

### `/admin/seo` (internal cockpit)

- **Index** — all sprints across all clients; cards with health badge + "Run today's SEO" button; filters (client, phase, status, health)
- **`sprints/new`** — three-step wizard (client+site → template → connect GSC + autopilot mode)
- **`sprints/[id]`** — tabbed: **Today**, **Tasks**, **Keywords**, **Backlinks**, **Content**, **Audits**, **Optimizations**, **Health**, **Settings**
- **`tools/`** — standalone access to in-house toolkit (not tied to a sprint)

### `/portal/seo` (client-facing, read-mostly)

- **Index** — their sprints. Headline number: "Day 47 of 90 — 28% impressions growth so far."
- **`sprints/[id]`** — tabbed: **Progress** (what's done), **Performance** (overall site metrics), **Pages** (per-page perf), **Blog** (per-post perf), **Keywords** (rankings), **Content** (editorial pipeline + drafts to approve), **Audits** (Day 1/30/60/90 reports + PDF)

**Hidden from clients:** optimization log, integration credentials/diagnostics, autopilot settings, internal toolkit.

### Shared

- **Pip presence pill** on every screen (matches social tools)
- **Notifications** via the existing `/admin/inbox` workspace inbox — no new channel
- **Visual style** matches existing admin (Tailwind + current shadcn pattern)

## Skill API surface

### `seo-sprint-manager/SKILL.md` capabilities (Pip-facing)

Browse & status, run a day's work, manage tasks, keyword work, backlink work, content work, audit work, optimization, tools, integrations.

### REST endpoints (full list)

```
# Sprints
GET    /seo/sprints
POST   /seo/sprints
GET    /seo/sprints/[id]
PATCH  /seo/sprints/[id]
POST   /seo/sprints/[id]/archive
GET    /seo/sprints/[id]/today
GET    /seo/sprints/[id]/health
POST   /seo/sprints/[id]/optimize
POST   /seo/sprints/[id]/run

# Tasks
GET    /seo/sprints/[id]/tasks
POST   /seo/sprints/[id]/tasks
PATCH  /seo/tasks/[id]
POST   /seo/tasks/[id]/complete
POST   /seo/tasks/[id]/skip
POST   /seo/tasks/[id]/execute

# Keywords
GET    /seo/sprints/[id]/keywords
POST   /seo/sprints/[id]/keywords
PATCH  /seo/keywords/[id]
DELETE /seo/keywords/[id]
POST   /seo/keywords/[id]/retire
GET    /seo/keywords/[id]/positions

# Backlinks
GET    /seo/sprints/[id]/backlinks
POST   /seo/sprints/[id]/backlinks
PATCH  /seo/backlinks/[id]
POST   /seo/backlinks/[id]/mark-live
GET    /seo/sprints/[id]/backlinks/discover

# Content
GET    /seo/sprints/[id]/content
POST   /seo/sprints/[id]/content
PATCH  /seo/content/[id]
POST   /seo/content/[id]/draft
POST   /seo/content/[id]/repurpose
POST   /seo/content/[id]/publish

# Audits
GET    /seo/sprints/[id]/audits
POST   /seo/sprints/[id]/audits
GET    /seo/audits/[id]
GET    /seo/audits/[id]/report.pdf
GET    /seo/audits/[id]/share

# Optimizations
GET    /seo/sprints/[id]/optimizations
POST   /seo/optimizations/[id]/approve
POST   /seo/optimizations/[id]/reject
POST   /seo/optimizations/[id]/measure

# Tools
POST   /seo/tools/metadata-check
POST   /seo/tools/robots-check
POST   /seo/tools/sitemap-check
POST   /seo/tools/canonical-check
POST   /seo/tools/crawler-sim
POST   /seo/tools/schema-validate
POST   /seo/tools/title-generate
POST   /seo/tools/meta-generate
POST   /seo/tools/slug-generate
POST   /seo/tools/keyword-density
POST   /seo/tools/keyword-discover
POST   /seo/tools/internal-link-audit
POST   /seo/tools/seo-roi
POST   /seo/tools/page-fetch

# Integrations
GET    /seo/integrations/gsc/auth-url
POST   /seo/integrations/gsc/callback
POST   /seo/integrations/gsc/disconnect/[sprintId]
POST   /seo/integrations/gsc/pull/[sprintId]
GET    /seo/integrations/bing/properties
POST   /seo/integrations/bing/connect/[sprintId]
POST   /seo/integrations/pagespeed/run/[sprintId]
```

### Cross-skill handoffs

- **Content repurposing** (week 5/6/13 tasks) — `seo` skill calls existing `/api/v1/social/posts` to draft LI/X posts from a published blog post; SEO record links to social post by `linkedSocialPostId`.
- **Day 90 audit announcement** — SEO skill generates audit, hands off to `social-media-manager` to schedule the announcement.
- **Community backlinks** (IndieHackers, Reddit) — recorded in `seo_backlinks` AND triggers a social post via the social skill. Two records linked by ID.

### Idempotency, errors, audit trail

- All `POST` creates accept `Idempotency-Key` header (existing `withIdempotency` wrapper)
- `actorFrom(user)` on every write — symmetric agent/human audit trail (`createdByType: 'user'|'agent'|'system'`)
- All endpoints write `orgId` for tenancy + `lastActor` for audit
- Soft-delete via `archive`; hard-delete only with `?force=true`

### Webhook events (9 new)

`seo.sprint.created`, `seo.sprint.archived`, `seo.task.completed`, `seo.audit.published`, `seo.optimization.proposed`, `seo.optimization.applied`, `seo.keyword.top10`, `seo.keyword.top3`, `seo.content.published`.

## Cron schedule

```
06:00 SAST  /api/cron/seo-daily      every day
07:00 SAST  /api/cron/seo-weekly     Mondays only
```

Registered in `vercel.json` alongside existing webhook + social crons.

## Out of scope (v1)

- Multi-template support (`outrank-90` only)
- Self-serve sprint creation by clients (admin-only in v1)
- Real-time SERP rank tracking (GSC `avgPosition` is source of truth)
- Paid backlink intelligence (Ahrefs/Moz/SEMrush)
- Bing WMT auto-verification (user verifies in Bing UI; we consume API after)
- GA4 integration on sprint metrics (kept separate from analytics-mvp)
- Per-org cron timezones (deferred-followups)
- Sprint cloning/forking
- A/B testing of multiple optimization hypotheses on the same page

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| GSC data takes 2–3 days to populate after verification — sprints in week 1 look broken | "GSC data warming up — first usable data ~Day 3" banner in cockpit when connected but no data |
| Common Crawl indexes lag by weeks — backlink discovery feels stale | Bing WMT primary, Common Crawl fallback only; document lag in UI |
| Optimization loop is noisy early when no scoreboard exists | Cap at 2 optimization tasks/sprint/week for first 4 weeks; scale after |
| AI-drafted blog posts in `full` autopilot publish low-quality content | `full` mode opt-in per sprint, gated behind settings confirmation; default `safe`; full audit log |
| GSC OAuth tokens expire/get revoked silently | Daily cron checks token validity; posts "Reconnect GSC" task to inbox |
| Outrank template gets stale | Template lives in code (`lib/seo/templates/outrank-90.ts`), version-controlled; existing sprints unaffected (sprint owns its tasks) |
| Daily cron slows when many sprints active | Per-sprint parallelisation via Vercel Functions; chunked batches with delay if needed (same pattern as webhook worker) |

## Rollout plan

**Phase A — Data + integrations (week 1)**
- Firestore collections, security rules, composite indexes
- GSC + Bing WMT + PageSpeed adapters
- Daily cron Loop A
- Dogfooded against partnersinbiz.online

**Phase B — Tasks, keywords, backlinks (week 2)**
- `seo_tasks` + `seo_keywords` + `seo_backlinks` endpoints
- `outrank-90` template seeded
- Admin cockpit: Today, Tasks, Keywords, Backlinks tabs
- Skill exposes browse + execute (Loop B without autopilot)

**Phase C — Content, audits, optimization (week 3)**
- `seo_content` + `seo_audits` + `seo_optimizations` endpoints
- Loop C — detectors + hypothesis generation + measurement
- Weekly cron
- Admin cockpit: Content, Audits, Optimizations tabs
- `social-media-manager` handoffs

**Phase D — In-house toolkit + portal + autopilot (week 4)**
- Tier 1 tools (13 tools)
- Tier 2 (Bing WMT live, OpenPageRank, Common Crawl)
- Tier 3 (keyword discovery)
- `/portal/seo` read-mostly view (Performance, Pages, Blog tabs)
- Autopilot `safe` and `full` modes
- Webhook events
- Onboarded for first paying client

**Phase E — Polish + docs (week 5)**
- Day 90 audit PDF rendering
- Public shareable audit URLs
- `SKILL.md` final pass
- Wiki article at `/Cowork/Cowork/agents/partners/wiki/seo-sprint-manager.md`
- Per-task-type autopilot settings UI

## Success criteria

- **Functional:** "Pip, do today's SEO for [client]" runs end-to-end autonomously where autopilot allows, escalates cleanly otherwise, < 5 min per sprint.
- **Data:** GSC pulls land daily for ≥ 95% of active sprints; token-expiry recovery automated.
- **Optimization loop:** ≥ 50% of optimization-loop hypotheses applied to test sites produce measurable position or impressions improvement after 14 days, tracked in scoreboard.
- **Client value:** Day 90 audit produces a credible "before vs after" report sendable to a paying client without manual cleanup.

## File map

```
partnersinbiz-web/
  app/(admin)/admin/seo/                      new
  app/(portal)/portal/seo/                    new
  app/api/v1/seo/                             new
  app/api/cron/seo-daily/                     new
  app/api/cron/seo-weekly/                    new
  app/api/integrations/gsc/callback/          new
  lib/seo/templates/outrank-90.ts             new
  lib/seo/tools/*.ts                          new (13 tools)
  lib/seo/integrations/gsc/                   new
  lib/seo/integrations/bing/                  new
  lib/seo/integrations/pagespeed/             new
  lib/seo/integrations/openpagerank/          new
  lib/seo/integrations/commoncrawl/           new
  lib/seo/loops/{daily,execution,optimization}.ts  new
  .claude/skills/seo-sprint-manager/SKILL.md  new
  firestore.rules                             updated (7 new collections)
  firestore.indexes.json                      updated (composite indexes)
  vercel.json                                 updated (2 new crons)
  docs/env-vars-seo.md                        new (PAGESPEED_API_KEY, OPR_API_KEY, BING_WMT_API_KEY)
```

## Dependencies on existing code

- `lib/api/idempotency.ts` (`withIdempotency` wrapper) — reused
- `lib/api/actor.ts` (`actorFrom`, `lastActorFrom`) — reused for symmetric audit
- Existing `/api/v1/social/posts` — called for cross-skill content repurposing
- Existing `/api/v1/webhooks` durable queue — used for 9 new event types
- Existing AI endpoints (used by title/meta/slug generators and content drafting)
- Existing Firestore TTL setup (for ephemeral data — none in v1, but pattern available)
- Existing Resend/email layer for client-facing audit reports
- Existing `clients` collection for sprint scoping (no separate `sites` collection — sprint owns site identity via `siteUrl` + `siteName`)
- Existing OAuth token storage pattern (KMS encryption) — reused for GSC + Bing
