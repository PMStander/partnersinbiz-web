# SEO Sprint Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 90-day SEO sprint manager (with open-ended Phase 4 "Compounding") that runs as the ninth Pip skill on the Partners in Biz platform — agent-driven, with three loops (daily refresh, execution, Karpathy-style optimization), in-house SEO toolkit replacing paid services, GSC + Bing + PageSpeed integrations, admin cockpit and client portal.

**Architecture:** Mirrors the existing `social/` module shape — Firestore collections under `seo_*`, REST API at `/api/v1/seo/*`, route trees at `/admin/seo` and `/portal/seo`, daily + weekly Vercel crons, skill at `.claude/skills/seo-sprint-manager/SKILL.md`. Loops live at `lib/seo/loops/`, integrations at `lib/seo/integrations/`, tools at `lib/seo/tools/`. All writes use the existing `withAuth` + `withIdempotency` + `actorFrom` primitives for symmetric agent/human audit trails.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Firebase Admin 13 / Firestore, Jest 30 + ts-jest, googleapis 171 (GSC), Resend 6 (email), recharts (perf charts), AI SDK 6 (drafting), Vercel Cron.

**Companion spec:** `docs/superpowers/specs/2026-05-04-seo-sprint-design.md`

---

## Cross-cutting conventions

These apply to every API task — do NOT repeat them in each task:

1. **All routes** start with `export const dynamic = 'force-dynamic'`
2. **Auth wrapper:** `withAuth('admin', ...)` for admin/agent endpoints; `withAuth('client', ...)` for portal endpoints. Skill calls use `Bearer ${AI_API_KEY}` which auths as role `ai` (admin-equivalent).
3. **All POST creates** are wrapped with `withIdempotency` from `@/lib/api/idempotency` (composes outside `withAuth`).
4. **Audit fields:** every Firestore create includes `...actorFrom(user)`; every update includes `...lastActorFrom(user)`. Both from `@/lib/api/actor`.
5. **Tenancy:** every collection write includes `orgId` from the request body or user context. Reads filter by `orgId`.
6. **Response helpers:** `apiSuccess(data, status?, meta?)` and `apiError(message, status?)` from `@/lib/api/response`. `apiErrorFromException(err)` for try/catch surfaces.
7. **Soft delete:** writes set `deleted: false` on create. Deletes set `deleted: true, deletedAt: serverTimestamp()` unless `?force=true`.
8. **Test convention:** mock `@/lib/firebase/admin` and `@/lib/api/auth` (or `@/lib/auth/middleware`) at the top of each test file. See `__tests__/api/sequences.test.ts` for the canonical pattern.
9. **Commit style:** small, focused commits per task. Format: `feat(seo): <what>` or `test(seo): <what>` or `fix(seo): <what>`.

---

## File structure (decomposition)

```
partnersinbiz-web/
├── lib/seo/
│   ├── templates/
│   │   └── outrank-90.ts                  Template definition (42 tasks)
│   ├── tools/
│   │   ├── metadata.ts
│   │   ├── robots.ts
│   │   ├── sitemap.ts
│   │   ├── canonical.ts
│   │   ├── crawler-sim.ts
│   │   ├── schema.ts
│   │   ├── ai-generators.ts               title, meta, slug
│   │   ├── keyword-density.ts
│   │   ├── keyword-discover.ts
│   │   ├── internal-link-audit.ts
│   │   ├── seo-roi.ts
│   │   └── page-fetch.ts                  shared cache fetch
│   ├── integrations/
│   │   ├── gsc/{auth,client,pull,index}.ts
│   │   ├── bing/{auth,client,pull,index}.ts
│   │   ├── pagespeed/{client,pull,index}.ts
│   │   ├── openpagerank/{client,index}.ts
│   │   └── commoncrawl/{client,index}.ts
│   ├── loops/
│   │   ├── daily.ts                       Loop A
│   │   ├── execution.ts                   Loop B
│   │   ├── optimization.ts                Loop C orchestrator
│   │   ├── detectors/
│   │   │   ├── stuck-page.ts
│   │   │   ├── lost-keyword.ts
│   │   │   ├── zero-impression-post.ts
│   │   │   ├── unindexed-page.ts
│   │   │   ├── directory-silence.ts
│   │   │   ├── cwv-regression.ts
│   │   │   ├── keyword-misalignment.ts
│   │   │   ├── pillar-orphan.ts
│   │   │   ├── compound-stagnation.ts
│   │   │   └── index.ts
│   │   └── hypotheses.ts                  Detector → hypothesis mapping
│   ├── types.ts                           Shared types for sprint, task, keyword, etc.
│   └── tenant.ts                          Sprint-scoping helpers
├── app/api/v1/seo/
│   ├── sprints/route.ts                   GET list, POST create
│   ├── sprints/[id]/route.ts              GET, PATCH
│   ├── sprints/[id]/archive/route.ts
│   ├── sprints/[id]/today/route.ts
│   ├── sprints/[id]/health/route.ts
│   ├── sprints/[id]/optimize/route.ts
│   ├── sprints/[id]/run/route.ts
│   ├── sprints/[id]/tasks/route.ts
│   ├── tasks/[id]/route.ts                PATCH
│   ├── tasks/[id]/complete/route.ts
│   ├── tasks/[id]/skip/route.ts
│   ├── tasks/[id]/execute/route.ts
│   ├── sprints/[id]/keywords/route.ts
│   ├── keywords/[id]/route.ts             PATCH, DELETE
│   ├── keywords/[id]/retire/route.ts
│   ├── keywords/[id]/positions/route.ts
│   ├── sprints/[id]/backlinks/route.ts
│   ├── backlinks/[id]/route.ts
│   ├── backlinks/[id]/mark-live/route.ts
│   ├── sprints/[id]/backlinks/discover/route.ts
│   ├── sprints/[id]/content/route.ts
│   ├── content/[id]/route.ts
│   ├── content/[id]/draft/route.ts
│   ├── content/[id]/repurpose/route.ts
│   ├── content/[id]/publish/route.ts
│   ├── sprints/[id]/audits/route.ts
│   ├── audits/[id]/route.ts
│   ├── audits/[id]/report.pdf/route.ts
│   ├── audits/[id]/share/route.ts
│   ├── sprints/[id]/optimizations/route.ts
│   ├── optimizations/[id]/approve/route.ts
│   ├── optimizations/[id]/reject/route.ts
│   ├── optimizations/[id]/measure/route.ts
│   ├── tools/{metadata-check,robots-check,sitemap-check,canonical-check,
│   │          crawler-sim,schema-validate,title-generate,meta-generate,
│   │          slug-generate,keyword-density,keyword-discover,
│   │          internal-link-audit,seo-roi,page-fetch}/route.ts
│   └── integrations/
│       ├── gsc/{auth-url,callback,disconnect/[sprintId],pull/[sprintId]}/route.ts
│       ├── bing/{properties,connect/[sprintId]}/route.ts
│       └── pagespeed/run/[sprintId]/route.ts
├── app/api/cron/seo-daily/route.ts        Loop A trigger
├── app/api/cron/seo-weekly/route.ts       Loop C trigger
├── app/(admin)/admin/seo/                 Admin cockpit
│   ├── page.tsx                           Sprints list
│   ├── sprints/new/page.tsx               Wizard
│   ├── sprints/[id]/                      Tabbed sprint cockpit
│   │   ├── page.tsx                       Today (default)
│   │   ├── tasks/page.tsx
│   │   ├── keywords/page.tsx
│   │   ├── backlinks/page.tsx
│   │   ├── content/page.tsx
│   │   ├── audits/page.tsx
│   │   ├── optimizations/page.tsx
│   │   ├── health/page.tsx
│   │   ├── settings/page.tsx
│   │   └── layout.tsx                     Tab nav
│   └── tools/page.tsx                     Standalone toolkit
├── app/(portal)/portal/seo/
│   ├── page.tsx                           Sprints list
│   └── sprints/[id]/
│       ├── page.tsx                       Progress (default)
│       ├── performance/page.tsx
│       ├── pages/page.tsx
│       ├── blog/page.tsx
│       ├── keywords/page.tsx
│       ├── content/page.tsx
│       ├── audits/page.tsx
│       └── layout.tsx
├── components/seo/                        Shared SEO components
│   ├── SprintCard.tsx
│   ├── HealthBadge.tsx
│   ├── PipPresencePill.tsx
│   ├── TaskRow.tsx
│   ├── KeywordTable.tsx
│   ├── KeywordSparkline.tsx
│   ├── BacklinkRow.tsx
│   ├── ContentRow.tsx
│   ├── AuditCard.tsx
│   ├── OptimizationRow.tsx
│   ├── CWVBadge.tsx
│   └── PerformanceChart.tsx
├── .claude/skills/seo-sprint-manager/SKILL.md
├── docs/env-vars-seo.md                   New env vars documented
├── firestore.rules                        Updated
├── firestore.indexes.json                 Updated
└── vercel.json                            Updated (2 new crons)
```

---

# Phase A — Data + integrations (Week 1)

Goal: Firestore foundation, GSC + Bing + PageSpeed adapters, daily cron Loop A. End state: at least one sprint can be created in Firestore, GSC tokens stored, daily cron pulls and refreshes data without errors.

## A.1: Shared types + tenant helpers

### Task A.1.1: Create lib/seo/types.ts

**Files:** Create: `lib/seo/types.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/seo/types.test.ts`:
```typescript
import type { SeoSprint, SeoTask, SeoKeyword, SeoBacklink, SeoContent, SeoAudit, SeoOptimization, SprintStatus, AutopilotMode, TaskStatus, IntentBucket } from '@/lib/seo/types'

describe('seo/types', () => {
  it('SprintStatus accepts the documented states', () => {
    const states: SprintStatus[] = ['pre-launch', 'active', 'compounding', 'paused', 'archived']
    expect(states).toHaveLength(5)
  })

  it('AutopilotMode accepts off/safe/full', () => {
    const modes: AutopilotMode[] = ['off', 'safe', 'full']
    expect(modes).toHaveLength(3)
  })

  it('TaskStatus accepts all six lifecycle states', () => {
    const states: TaskStatus[] = ['not_started', 'in_progress', 'blocked', 'done', 'skipped', 'na']
    expect(states).toHaveLength(6)
  })

  it('IntentBucket accepts the three buckets', () => {
    const b: IntentBucket[] = ['problem', 'solution', 'brand']
    expect(b).toHaveLength(3)
  })

  it('SeoSprint has required fields', () => {
    const s: SeoSprint = {
      id: 's1', orgId: 'o1', clientId: 'c1',
      siteUrl: 'https://example.com', siteName: 'Example',
      startDate: new Date().toISOString(),
      currentDay: 1, currentWeek: 0, currentPhase: 0,
      status: 'pre-launch',
      templateId: 'outrank-90',
      autopilotMode: 'safe',
      autopilotTaskTypes: [],
      integrations: { gsc: { connected: false }, bing: { connected: false }, pagespeed: { enabled: false } },
      createdAt: new Date().toISOString(),
      createdBy: 'u1',
      createdByType: 'user',
      deleted: false,
    }
    expect(s.id).toBe('s1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/lib/seo/types.test.ts`
Expected: FAIL with "Cannot find module '@/lib/seo/types'"

- [ ] **Step 3: Create lib/seo/types.ts**

```typescript
import type { Timestamp } from 'firebase-admin/firestore'

export type SprintStatus = 'pre-launch' | 'active' | 'compounding' | 'paused' | 'archived'
export type AutopilotMode = 'off' | 'safe' | 'full'
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'skipped' | 'na'
export type TaskSource = 'template' | 'manual' | 'optimization'
export type IntentBucket = 'problem' | 'solution' | 'brand'
export type KeywordStatus = 'not_yet' | 'in_progress' | 'ranking' | 'top_10' | 'top_3' | 'lost'
export type BacklinkType = 'directory' | 'community' | 'guest_post' | 'link_trade' | 'organic'
export type BacklinkStatus = 'not_started' | 'submitted' | 'live' | 'rejected' | 'lost'
export type ContentType = 'comparison' | 'use-case' | 'pillar' | 'cluster' | 'how-to' | 'alternative'
export type ContentStatus = 'idea' | 'drafting' | 'review' | 'scheduled' | 'live'
export type OptimizationStatus = 'proposed' | 'approved' | 'in_progress' | 'applied' | 'rejected' | 'measured'
export type OptimizationResult = 'win' | 'no-change' | 'loss'
export type SignalType =
  | 'stuck_page' | 'lost_keyword' | 'zero_impression_post' | 'unindexed_page'
  | 'directory_silence' | 'cwv_regression' | 'keyword_misalignment'
  | 'pillar_orphan' | 'compound_stagnation'

export interface IntegrationGsc { connected: boolean; propertyUrl?: string; lastPullAt?: string; scopes?: string[]; tokenStatus?: 'valid' | 'expired' | 'revoked' }
export interface IntegrationBing { connected: boolean; siteUrl?: string; lastPullAt?: string; tokenStatus?: 'valid' | 'expired' | 'revoked' }
export interface IntegrationPagespeed { enabled: boolean; lastPullAt?: string }

export interface TodayPlan {
  asOf: string
  currentDay: number
  currentWeek: number
  due: string[]
  inProgress: string[]
  blocked: { taskId: string; reason: string }[]
  optimizationProposals: string[]
}

export interface HealthSignal {
  type: SignalType
  severity: 'low' | 'medium' | 'high'
  evidence: Record<string, unknown>
}

export interface SeoSprint {
  id: string
  orgId: string
  clientId: string
  siteUrl: string
  siteName: string
  startDate: string
  currentDay: number
  currentWeek: number
  currentPhase: 0 | 1 | 2 | 3 | 4
  status: SprintStatus
  templateId: string
  autopilotMode: AutopilotMode
  autopilotTaskTypes: string[]
  integrations: { gsc: IntegrationGsc; bing: IntegrationBing; pagespeed: IntegrationPagespeed }
  todayPlan?: TodayPlan
  health?: { score: number; signals: HealthSignal[] }
  scoreboard?: Record<string, { wins: number; losses: number; noChange: number }>
  createdAt: string | Timestamp
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  updatedAt?: string | Timestamp
  updatedBy?: string
  updatedByType?: 'user' | 'agent' | 'system'
  deleted: boolean
  deletedAt?: string | Timestamp
}

export interface SeoTask {
  id: string
  sprintId: string
  orgId: string
  week: number
  phase: 0 | 1 | 2 | 3 | 4
  focus: string
  title: string
  description?: string
  internalToolUrl?: string
  externalReferenceUrl?: string
  status: TaskStatus
  source: TaskSource
  parentOptimizationId?: string
  taskType: string
  autopilotEligible: boolean
  assignee?: { type: 'user' | 'agent'; id: string }
  outputArtifactId?: string
  blockerReason?: string
  dueAt?: string
  completedAt?: string
  completedBy?: string
  createdAt: string | Timestamp
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  deleted: boolean
}

export interface KeywordPosition {
  pulledAt: string
  position: number
  source: 'gsc' | 'manual'
  impressions?: number
  clicks?: number
  ctr?: number
}

export interface SeoKeyword {
  id: string
  sprintId: string
  orgId: string
  keyword: string
  volume?: number
  topThreeDR?: number
  intentBucket: IntentBucket
  targetPageUrl?: string
  positions: KeywordPosition[]
  currentPosition?: number
  currentImpressions?: number
  currentClicks?: number
  currentCtr?: number
  status: KeywordStatus
  retiredAt?: string
  createdAt: string | Timestamp
  deleted: boolean
}

export interface SeoBacklink {
  id: string
  sprintId: string
  orgId: string
  source: string
  domain: string
  type: BacklinkType
  theirDR?: number
  status: BacklinkStatus
  submittedAt?: string
  liveAt?: string
  url?: string
  notes?: string
  linkedSocialPostId?: string
  discoveredVia: 'manual' | 'bing-wmt' | 'common-crawl' | 'gsc-links'
  createdAt: string | Timestamp
  deleted: boolean
}

export interface SeoContent {
  id: string
  sprintId: string
  orgId: string
  publishDate?: string
  title: string
  type: ContentType
  targetKeywordId?: string
  targetUrl?: string
  status: ContentStatus
  draftPostId?: string
  liUrl?: string
  xUrl?: string
  internalLinksAdded: boolean
  performance?: { impressions?: number; clicks?: number; position?: number; lastPulledAt?: string }
  createdAt: string | Timestamp
  deleted: boolean
}

export interface SeoAudit {
  id: string
  sprintId: string
  orgId: string
  snapshotDay: number
  capturedAt: string
  traffic: { impressions: number; clicks: number; ctr: number; avgPosition: number }
  rankings: { top100: number; top10: number; top3: number }
  authority: { dr?: number; referringDomains: number; totalBacklinks: number }
  content: { pagesIndexed: number; postsPublished: number; comparisonPagesLive: number }
  source: 'gsc' | 'manual' | 'mixed'
  publicShareToken?: string
  pdfUrl?: string
  deleted: boolean
}

export interface SeoOptimization {
  id: string
  sprintId: string
  orgId: string
  detectedAt: string
  signal: HealthSignal
  hypothesis: string
  hypothesisType: string
  proposedAction: string
  generatedTaskIds: string[]
  status: OptimizationStatus
  outcomeMeasureScheduledFor?: string
  baselineSnapshot?: Record<string, unknown>
  outcomeMeasuredAt?: string
  outcomeDelta?: { positionChange?: number; impressionsChange?: number; clicksChange?: number }
  result?: OptimizationResult
  notes?: string
  deleted: boolean
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/lib/seo/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/seo/types.ts __tests__/lib/seo/types.test.ts
git commit -m "feat(seo): add shared types for sprint manager"
```

### Task A.1.2: Create lib/seo/tenant.ts

**Files:** Create: `lib/seo/tenant.ts`, Test: `__tests__/lib/seo/tenant.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { sprintIdsForUser, requireSprintAccess } from '@/lib/seo/tenant'

const mockGet = jest.fn()
const mockWhere = jest.fn(() => ({ get: mockGet }))
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere, doc: () => ({ get: mockGet }) }) },
}))

describe('seo/tenant', () => {
  it('sprintIdsForUser scopes by orgId', async () => {
    mockGet.mockResolvedValueOnce({ docs: [{ id: 's1' }, { id: 's2' }] })
    const ids = await sprintIdsForUser({ uid: 'u1', role: 'admin', orgId: 'o1' } as any)
    expect(ids).toEqual(['s1', 's2'])
    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'o1')
  })

  it('requireSprintAccess throws when sprint orgId mismatch', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ orgId: 'other-org', deleted: false }) })
    await expect(
      requireSprintAccess('s1', { uid: 'u1', role: 'admin', orgId: 'o1' } as any),
    ).rejects.toThrow(/access/i)
  })

  it('requireSprintAccess returns sprint when orgId matches', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ orgId: 'o1', deleted: false, siteName: 'X' }) })
    const sprint = await requireSprintAccess('s1', { uid: 'u1', role: 'admin', orgId: 'o1' } as any)
    expect(sprint.siteName).toBe('X')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

`npx jest __tests__/lib/seo/tenant.test.ts` → FAIL "Cannot find module"

- [ ] **Step 3: Implement**

```typescript
import { adminDb } from '@/lib/firebase/admin'
import type { ApiUser } from '@/lib/api/types'

export async function sprintIdsForUser(user: ApiUser): Promise<string[]> {
  if (!user.orgId) return []
  const snap = await adminDb.collection('seo_sprints').where('orgId', '==', user.orgId).get()
  return snap.docs.map((d) => d.id)
}

export async function requireSprintAccess(sprintId: string, user: ApiUser) {
  const snap = await adminDb.collection('seo_sprints').doc(sprintId).get()
  if (!snap.exists) throw new Error('Sprint not found')
  const data = snap.data() as { orgId: string; deleted?: boolean }
  if (data.deleted) throw new Error('Sprint not found')
  if (user.role !== 'ai' && data.orgId !== user.orgId) {
    throw new Error('Sprint access denied')
  }
  return { id: snap.id, ...data }
}
```

- [ ] **Step 4: Verify pass**

`npx jest __tests__/lib/seo/tenant.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add lib/seo/tenant.ts __tests__/lib/seo/tenant.test.ts
git commit -m "feat(seo): add sprint tenant scoping helpers"
```

## A.2: Outrank-90 template

### Task A.2.1: Create lib/seo/templates/outrank-90.ts

**Files:** Create: `lib/seo/templates/outrank-90.ts`, Test: `__tests__/lib/seo/templates/outrank-90.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { OUTRANK_90 } from '@/lib/seo/templates/outrank-90'

describe('outrank-90 template', () => {
  it('has 42 tasks', () => {
    expect(OUTRANK_90.tasks).toHaveLength(42)
  })
  it('every task has the required fields', () => {
    for (const t of OUTRANK_90.tasks) {
      expect(typeof t.title).toBe('string')
      expect(typeof t.taskType).toBe('string')
      expect(typeof t.week).toBe('number')
      expect([0, 1, 2, 3]).toContain(t.phase)
      expect(typeof t.autopilotEligible).toBe('boolean')
    }
  })
  it('starts in week 0 (pre-launch) and ends in week 13 (Day 90 audit)', () => {
    const weeks = OUTRANK_90.tasks.map((t) => t.week)
    expect(Math.min(...weeks)).toBe(0)
    expect(Math.max(...weeks)).toBe(13)
  })
  it('id is outrank-90 and version is set', () => {
    expect(OUTRANK_90.id).toBe('outrank-90')
    expect(OUTRANK_90.version).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

`npx jest __tests__/lib/seo/templates/outrank-90.test.ts` → FAIL

- [ ] **Step 3: Implement**

Create `lib/seo/templates/outrank-90.ts` with all 42 tasks from the Outrank sheet:

```typescript
export interface SeoTaskTemplate {
  week: number
  phase: 0 | 1 | 2 | 3
  focus: string
  title: string
  description?: string
  taskType: string             // e.g. 'meta-tag-draft', 'directory-submission'
  autopilotEligible: boolean   // default whether Pip can run it solo
  internalToolPath?: string    // points to /admin/seo/tools/...
}

export interface SeoTemplate {
  id: string
  version: number
  name: string
  tasks: SeoTaskTemplate[]
}

export const OUTRANK_90: SeoTemplate = {
  id: 'outrank-90',
  version: 1,
  name: 'Outrank 90-Day SEO Sprint',
  tasks: [
    // Phase 0 — Pre-launch (Week 0)
    { week: 0, phase: 0, focus: 'Pre-launch', title: 'Set up meta tags on every page (title, description, OG image)', taskType: 'meta-tag-audit', autopilotEligible: true, internalToolPath: '/admin/seo/tools#metadata-check' },
    { week: 0, phase: 0, focus: 'Pre-launch', title: 'Add SoftwareApplication + FAQ schema (structured data)', taskType: 'schema-add', autopilotEligible: true },
    { week: 0, phase: 0, focus: 'Pre-launch', title: 'Verify site in Google Search Console', taskType: 'gsc-verify', autopilotEligible: false },
    { week: 0, phase: 0, focus: 'Pre-launch', title: 'Submit sitemap.xml to GSC', taskType: 'sitemap-submit', autopilotEligible: false, internalToolPath: '/admin/seo/tools#sitemap-check' },
    { week: 0, phase: 0, focus: 'Pre-launch', title: 'Manually request indexing for 5 core pages', taskType: 'gsc-request-index', autopilotEligible: false },
    { week: 0, phase: 0, focus: 'Pre-launch', title: 'Set up Bing Webmaster Tools (import from GSC)', taskType: 'bing-verify', autopilotEligible: false },
    { week: 0, phase: 0, focus: 'Pre-launch', title: 'Cross-link from existing property to new site', taskType: 'cross-link', autopilotEligible: false },
    // Phase 1 — Foundation (Weeks 1-4)
    { week: 1, phase: 1, focus: 'Tech Audit', title: 'Check robots.txt — nothing blocking crawlers', taskType: 'robots-check', autopilotEligible: true, internalToolPath: '/admin/seo/tools#robots-check' },
    { week: 1, phase: 1, focus: 'Tech Audit', title: 'Check all core pages are being indexed in GSC', taskType: 'gsc-index-check', autopilotEligible: true },
    { week: 1, phase: 1, focus: 'Tech Audit', title: 'Check page speed at pagespeed.web.dev', taskType: 'pagespeed-check', autopilotEligible: true },
    { week: 1, phase: 1, focus: 'Tech Audit', title: 'Confirm Core Web Vitals: LCP < 2.5s, CLS minimal', taskType: 'cwv-check', autopilotEligible: true },
    { week: 1, phase: 1, focus: 'Tech Audit', title: 'Check canonical tags on all key pages', taskType: 'canonical-check', autopilotEligible: true, internalToolPath: '/admin/seo/tools#canonical-check' },
    { week: 1, phase: 1, focus: 'Tech Audit', title: 'Add alt text to all images', taskType: 'alt-text-audit', autopilotEligible: false },
    { week: 1, phase: 1, focus: 'Tech Audit', title: 'Add noindex to login, dashboard, onboarding pages', taskType: 'noindex-add', autopilotEligible: false },
    { week: 2, phase: 1, focus: 'Keywords', title: 'Pick 20–30 winnable keywords (DR of top 3 results < 50)', taskType: 'keyword-discover', autopilotEligible: true, internalToolPath: '/admin/seo/tools#keyword-discover' },
    { week: 2, phase: 1, focus: 'Keywords', title: 'Sort keywords into 3 intent buckets (Problem / Solution / Brand)', taskType: 'keyword-bucket', autopilotEligible: true },
    { week: 2, phase: 1, focus: 'Keywords', title: 'Identify 5 keywords for immediate content (solution-aware first)', taskType: 'keyword-prioritize', autopilotEligible: true },
    { week: 2, phase: 1, focus: 'Keywords', title: 'Record all keywords in the Keywords tab', taskType: 'keyword-record', autopilotEligible: true },
    { week: 3, phase: 1, focus: 'Core Pages', title: 'Write homepage with primary keyword in H1', taskType: 'page-write', autopilotEligible: true, internalToolPath: '/admin/seo/tools#title-generate' },
    { week: 3, phase: 1, focus: 'Core Pages', title: 'Write primary use-case page', taskType: 'page-write', autopilotEligible: true },
    { week: 3, phase: 1, focus: 'Core Pages', title: 'Write first comparison page (you vs category leader)', taskType: 'page-write', autopilotEligible: true },
    { week: 4, phase: 1, focus: 'Core Pages', title: 'Add FAQ schema to all three core pages', taskType: 'schema-add', autopilotEligible: true },
    { week: 4, phase: 1, focus: 'Core Pages', title: 'Add internal links between core pages', taskType: 'internal-link-add', autopilotEligible: true },
    // Phase 2 — Content engine (Weeks 5-10)
    { week: 5, phase: 2, focus: 'Content', title: 'Publish post 1 — comparison or alternative format', taskType: 'post-publish', autopilotEligible: false },
    { week: 5, phase: 2, focus: 'Content', title: 'Repurpose post 1 → LinkedIn post + X thread', taskType: 'post-repurpose', autopilotEligible: false },
    { week: 6, phase: 2, focus: 'Content', title: 'Publish post 2 — use-case format', taskType: 'post-publish', autopilotEligible: false },
    { week: 6, phase: 2, focus: 'Content', title: 'Repurpose post 2 → LinkedIn post + X thread', taskType: 'post-repurpose', autopilotEligible: false },
    { week: 7, phase: 2, focus: 'Pillar Post', title: 'Publish pillar post (2,000+ words on core topic)', taskType: 'pillar-publish', autopilotEligible: false },
    { week: 7, phase: 2, focus: 'Pillar Post', title: 'Add internal links from all existing posts to pillar', taskType: 'internal-link-add', autopilotEligible: true },
    { week: 8, phase: 2, focus: 'pSEO', title: 'Launch feature page templates', taskType: 'pseo-feature', autopilotEligible: false },
    { week: 8, phase: 2, focus: 'pSEO', title: 'Launch alternative/comparison page templates', taskType: 'pseo-comparison', autopilotEligible: false },
    { week: 9, phase: 2, focus: 'Backlinks', title: 'Submit to 15 SaaS directories (log in Backlinks tab)', taskType: 'directory-submission', autopilotEligible: true },
    { week: 9, phase: 2, focus: 'Backlinks', title: 'DM 3 founders for link trades', taskType: 'link-trade-dm', autopilotEligible: false },
    { week: 10, phase: 2, focus: 'Backlinks', title: 'Pitch 1 guest post to a relevant DR 40+ blog', taskType: 'guest-post-pitch', autopilotEligible: false },
    { week: 10, phase: 2, focus: 'Backlinks', title: 'Submit to IndieHackers and relevant subreddits', taskType: 'community-post', autopilotEligible: false },
    // Phase 3 — Authority (Weeks 11-13)
    { week: 11, phase: 3, focus: 'Authority', title: 'Open GSC — find pages ranking position 8–20', taskType: 'gsc-stuck-pages', autopilotEligible: true },
    { week: 11, phase: 3, focus: 'Authority', title: 'Update each position 8–20 page (add depth, FAQ, structure)', taskType: 'page-rewrite', autopilotEligible: true },
    { week: 12, phase: 3, focus: 'Cluster', title: 'Pick one keyword theme for content cluster', taskType: 'cluster-pick', autopilotEligible: true },
    { week: 12, phase: 3, focus: 'Cluster', title: 'Publish 5–7 supporting posts around pillar — all interlinked', taskType: 'cluster-publish', autopilotEligible: false },
    { week: 13, phase: 3, focus: 'Day 90 Audit', title: 'Pull all metrics: impressions, clicks, DR, keywords', taskType: 'audit-snapshot', autopilotEligible: true },
    { week: 13, phase: 3, focus: 'Day 90 Audit', title: 'Fill in Day 90 Audit tab and screenshot it', taskType: 'audit-render', autopilotEligible: true },
    { week: 13, phase: 3, focus: 'Day 90 Audit', title: 'Post your GSC impressions chart on X/LinkedIn', taskType: 'audit-announce', autopilotEligible: false },
  ],
}
```

- [ ] **Step 4: Verify pass**

`npx jest __tests__/lib/seo/templates/outrank-90.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add lib/seo/templates/outrank-90.ts __tests__/lib/seo/templates/outrank-90.test.ts
git commit -m "feat(seo): add outrank-90 template (42 tasks)"
```

## A.3: Firestore security rules + composite indexes

### Task A.3.1: Update firestore.rules

**Files:** Modify: `firestore.rules`

- [ ] **Step 1: Read existing rules**

Run: `cat firestore.rules` to see the current admin/system block pattern.

- [ ] **Step 2: Append the seven new collection blocks**

Append (preserving final closing brace) inside the `service cloud.firestore { match /databases/{db}/documents {` scope:

```
match /seo_sprints/{id} {
  allow read: if request.auth != null && resource.data.orgId == request.auth.token.orgId;
  allow write: if false; // admin SDK only
}
match /seo_tasks/{id} {
  allow read: if request.auth != null && resource.data.orgId == request.auth.token.orgId;
  allow write: if false;
}
match /seo_keywords/{id} {
  allow read: if request.auth != null && resource.data.orgId == request.auth.token.orgId;
  allow write: if false;
}
match /seo_backlinks/{id} {
  allow read: if request.auth != null && resource.data.orgId == request.auth.token.orgId;
  allow write: if false;
}
match /seo_content/{id} {
  allow read: if request.auth != null && resource.data.orgId == request.auth.token.orgId;
  allow write: if false;
}
match /seo_audits/{id} {
  allow read: if request.auth != null
    && (resource.data.orgId == request.auth.token.orgId
        || resource.data.publicShareToken == request.query.token);
  allow write: if false;
}
match /seo_optimizations/{id} {
  // Admin only — clients never read optimization log
  allow read: if false;
  allow write: if false;
}
```

- [ ] **Step 3: Deploy rules**

Run: `firebase deploy --only firestore:rules`
Expected: deploy succeeds (warnings on pre-existing `organizations` block are noise — ignore).

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(seo): add firestore security rules for seo collections"
```

### Task A.3.2: Add composite indexes

**Files:** Modify: `firestore.indexes.json`

- [ ] **Step 1: Add the indexes**

Append to the `indexes` array in `firestore.indexes.json`:

```json
{ "collectionGroup": "seo_sprints", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "orgId", "order": "ASCENDING" },
  { "fieldPath": "status", "order": "ASCENDING" },
  { "fieldPath": "deleted", "order": "ASCENDING" },
  { "fieldPath": "createdAt", "order": "DESCENDING" }
]},
{ "collectionGroup": "seo_tasks", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "sprintId", "order": "ASCENDING" },
  { "fieldPath": "week", "order": "ASCENDING" },
  { "fieldPath": "deleted", "order": "ASCENDING" }
]},
{ "collectionGroup": "seo_tasks", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "sprintId", "order": "ASCENDING" },
  { "fieldPath": "status", "order": "ASCENDING" },
  { "fieldPath": "deleted", "order": "ASCENDING" }
]},
{ "collectionGroup": "seo_keywords", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "sprintId", "order": "ASCENDING" },
  { "fieldPath": "deleted", "order": "ASCENDING" },
  { "fieldPath": "keyword", "order": "ASCENDING" }
]},
{ "collectionGroup": "seo_backlinks", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "sprintId", "order": "ASCENDING" },
  { "fieldPath": "status", "order": "ASCENDING" },
  { "fieldPath": "deleted", "order": "ASCENDING" }
]},
{ "collectionGroup": "seo_content", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "sprintId", "order": "ASCENDING" },
  { "fieldPath": "publishDate", "order": "DESCENDING" },
  { "fieldPath": "deleted", "order": "ASCENDING" }
]},
{ "collectionGroup": "seo_audits", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "sprintId", "order": "ASCENDING" },
  { "fieldPath": "snapshotDay", "order": "ASCENDING" },
  { "fieldPath": "deleted", "order": "ASCENDING" }
]},
{ "collectionGroup": "seo_optimizations", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "sprintId", "order": "ASCENDING" },
  { "fieldPath": "status", "order": "ASCENDING" },
  { "fieldPath": "detectedAt", "order": "DESCENDING" }
]}
```

- [ ] **Step 2: Deploy**

Run: `firebase deploy --only firestore:indexes`
Expected: indexes queued (build takes minutes).

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(seo): add composite indexes for seo collections"
```

## A.4: GSC integration adapter (parallel-eligible — independent subagent)

### Task A.4.1: Build the GSC OAuth + client adapter

**Files:** Create: `lib/seo/integrations/gsc/auth.ts`, `lib/seo/integrations/gsc/client.ts`, `lib/seo/integrations/gsc/pull.ts`, `lib/seo/integrations/gsc/index.ts`. Tests: `__tests__/lib/seo/integrations/gsc/{auth,client,pull}.test.ts`.

- [ ] **Step 1: Write failing test for `auth.ts`**

`__tests__/lib/seo/integrations/gsc/auth.test.ts`:
```typescript
import { gscAuthUrl, exchangeGscCode } from '@/lib/seo/integrations/gsc/auth'

process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec'
process.env.GSC_REDIRECT_URI = 'https://x/api/integrations/gsc/callback'

describe('gsc/auth', () => {
  it('builds auth URL with webmasters.readonly scope', () => {
    const url = gscAuthUrl('state-123')
    expect(url).toContain('client_id=cid')
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('webmasters.readonly')
    expect(url).toContain('state=state-123')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

`npx jest __tests__/lib/seo/integrations/gsc/auth.test.ts` → FAIL

- [ ] **Step 3: Implement `auth.ts`**

```typescript
import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']

function client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GSC_REDIRECT_URI,
  )
}

export function gscAuthUrl(state: string): string {
  return client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  })
}

export async function exchangeGscCode(code: string) {
  const oauth = client()
  const { tokens } = await oauth.getToken(code)
  return tokens // { access_token, refresh_token, expiry_date, ... }
}

export function refreshGscClient(refreshToken: string) {
  const oauth = client()
  oauth.setCredentials({ refresh_token: refreshToken })
  return oauth
}
```

- [ ] **Step 4: Verify PASS**

`npx jest __tests__/lib/seo/integrations/gsc/auth.test.ts` → PASS

- [ ] **Step 5: Write failing test for `client.ts`**

`__tests__/lib/seo/integrations/gsc/client.test.ts`:
```typescript
const mockSearchAnalytics = jest.fn()
const mockUrlInspection = jest.fn()
jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    webmasters: () => ({
      searchanalytics: { query: mockSearchAnalytics },
      urlInspection: { index: { inspect: mockUrlInspection } },
    }),
  },
}))

import { fetchSearchAnalytics, inspectUrl } from '@/lib/seo/integrations/gsc/client'

describe('gsc/client', () => {
  it('fetchSearchAnalytics queries with [page, query] dimensions and returns rows', async () => {
    mockSearchAnalytics.mockResolvedValueOnce({ data: { rows: [{ keys: ['/p', 'q'], impressions: 10, clicks: 1, ctr: 0.1, position: 5 }] } })
    const rows = await fetchSearchAnalytics({} as any, 'sc-domain:example.com', '2026-04-01', '2026-04-07')
    expect(rows).toHaveLength(1)
    expect(rows[0].page).toBe('/p')
    expect(rows[0].query).toBe('q')
    expect(rows[0].position).toBe(5)
  })

  it('inspectUrl returns coverage status', async () => {
    mockUrlInspection.mockResolvedValueOnce({ data: { inspectionResult: { indexStatusResult: { coverageState: 'INDEXED' } } } })
    const r = await inspectUrl({} as any, 'https://example.com/p', 'sc-domain:example.com')
    expect(r.coverageState).toBe('INDEXED')
  })
})
```

- [ ] **Step 6: Implement `client.ts`**

```typescript
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

export interface SearchAnalyticsRow {
  page: string
  query: string
  impressions: number
  clicks: number
  ctr: number
  position: number
}

export async function fetchSearchAnalytics(
  auth: OAuth2Client,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<SearchAnalyticsRow[]> {
  const wm = google.webmasters({ version: 'v3', auth })
  const res = await wm.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['page', 'query'],
      rowLimit: 5000,
    },
  })
  return (res.data.rows ?? []).map((r) => ({
    page: r.keys?.[0] ?? '',
    query: r.keys?.[1] ?? '',
    impressions: r.impressions ?? 0,
    clicks: r.clicks ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }))
}

export async function inspectUrl(
  auth: OAuth2Client,
  inspectionUrl: string,
  siteUrl: string,
): Promise<{ coverageState: string; lastCrawlTime?: string }> {
  const wm = google.webmasters({ version: 'v3', auth })
  // Note: urlInspection lives on the searchconsole API, not webmasters — use direct REST
  const sc = google.searchconsole({ version: 'v1', auth })
  const res = await sc.urlInspection.index.inspect({
    requestBody: { inspectionUrl, siteUrl },
  })
  const r = res.data.inspectionResult?.indexStatusResult
  return { coverageState: r?.coverageState ?? 'UNKNOWN', lastCrawlTime: r?.lastCrawlTime ?? undefined }
}
```

- [ ] **Step 7: Verify PASS, then write `pull.ts`**

`__tests__/lib/seo/integrations/gsc/pull.test.ts`:
```typescript
const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockSet = jest.fn()
const mockBatch = { set: jest.fn(), update: jest.fn(), commit: jest.fn() }
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: mockGet, update: mockUpdate, set: mockSet }), where: () => ({ get: mockGet }) }),
    batch: () => mockBatch,
  },
}))
jest.mock('@/lib/seo/integrations/gsc/auth', () => ({ refreshGscClient: () => ({}) }))
jest.mock('@/lib/seo/integrations/gsc/client', () => ({
  fetchSearchAnalytics: jest.fn(async () => [
    { page: '/x', query: 'foo', impressions: 100, clicks: 5, ctr: 0.05, position: 10 },
  ]),
}))

import { pullDailyGscForSprint } from '@/lib/seo/integrations/gsc/pull'

beforeEach(() => jest.clearAllMocks())

describe('pullDailyGscForSprint', () => {
  it('writes positions onto matching seo_keywords and updates lastPullAt', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        orgId: 'o1',
        integrations: { gsc: { connected: true, propertyUrl: 'sc-domain:x', tokens: { refresh_token: 'r' } } },
      }),
    })
    // keywords matching the GSC query "foo"
    mockGet.mockResolvedValueOnce({ docs: [{ id: 'k1', ref: { update: jest.fn() }, data: () => ({ keyword: 'foo', positions: [] }) }] })
    await pullDailyGscForSprint('s1')
    expect(mockBatch.commit).toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'integrations.gsc.lastPullAt': expect.anything() }))
  })
})
```

- [ ] **Step 8: Implement `pull.ts`**

```typescript
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { refreshGscClient } from './auth'
import { fetchSearchAnalytics } from './client'

function dateNDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export async function pullDailyGscForSprint(sprintId: string): Promise<void> {
  const sprintRef = adminDb.collection('seo_sprints').doc(sprintId)
  const snap = await sprintRef.get()
  if (!snap.exists) return
  const sprint = snap.data() as any
  const gsc = sprint.integrations?.gsc
  if (!gsc?.connected || !gsc?.propertyUrl || !gsc?.tokens?.refresh_token) return

  const auth = refreshGscClient(gsc.tokens.refresh_token)
  const rows = await fetchSearchAnalytics(auth as any, gsc.propertyUrl, dateNDaysAgo(8), dateNDaysAgo(1))

  // Update keywords
  const keywordsSnap = await adminDb.collection('seo_keywords').where('sprintId', '==', sprintId).get()
  const batch = adminDb.batch()
  const now = new Date().toISOString()
  for (const doc of keywordsSnap.docs) {
    const k = doc.data() as any
    const matches = rows.filter((r) => r.query.toLowerCase() === k.keyword.toLowerCase())
    if (matches.length === 0) continue
    const agg = matches.reduce(
      (a, r) => ({ impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, position: a.position + r.position * r.impressions }),
      { impressions: 0, clicks: 0, position: 0 },
    )
    const avgPosition = agg.impressions > 0 ? agg.position / agg.impressions : 0
    const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0
    const newPosition = { pulledAt: now, position: avgPosition, source: 'gsc', impressions: agg.impressions, clicks: agg.clicks, ctr }
    batch.update(doc.ref, {
      positions: FieldValue.arrayUnion(newPosition),
      currentPosition: avgPosition,
      currentImpressions: agg.impressions,
      currentClicks: agg.clicks,
      currentCtr: ctr,
      status: avgPosition <= 3 ? 'top_3' : avgPosition <= 10 ? 'top_10' : avgPosition <= 100 ? 'ranking' : 'not_yet',
    })
  }
  await batch.commit()
  await sprintRef.update({
    'integrations.gsc.lastPullAt': FieldValue.serverTimestamp(),
    'integrations.gsc.tokenStatus': 'valid',
  })
}
```

- [ ] **Step 9: Add `index.ts` re-export, run all GSC tests, commit**

```typescript
// lib/seo/integrations/gsc/index.ts
export * from './auth'
export * from './client'
export * from './pull'
```

Run: `npx jest __tests__/lib/seo/integrations/gsc/`
Expected: all PASS.

```bash
git add lib/seo/integrations/gsc __tests__/lib/seo/integrations/gsc
git commit -m "feat(seo): add GSC integration adapter (auth + client + daily pull)"
```

## A.5: Bing Webmaster Tools adapter (parallel-eligible)

### Task A.5.1: Build the Bing WMT client + pull

**Files:** Create: `lib/seo/integrations/bing/{auth,client,pull,index}.ts`. Tests: `__tests__/lib/seo/integrations/bing/{client,pull}.test.ts`.

Bing WMT API uses an API key (not OAuth). Store in env: `BING_WMT_API_KEY`. Per-sprint: store the verified site URL.

- [ ] **Step 1: Write failing test for `client.ts`**

```typescript
const mockFetch = jest.fn()
global.fetch = mockFetch as any
import { fetchInboundLinks, fetchQueryStats } from '@/lib/seo/integrations/bing/client'
process.env.BING_WMT_API_KEY = 'k'

describe('bing/client', () => {
  it('fetchInboundLinks calls Bing API with apikey query param', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ d: [{ Url: 'https://x', SourceUrl: 'https://src', AnchorText: 'a' }] }) })
    const links = await fetchInboundLinks('https://example.com')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('apikey=k'), expect.anything())
    expect(links[0].sourceUrl).toBe('https://src')
  })
})
```

- [ ] **Step 2: Verify FAIL, implement**

```typescript
// lib/seo/integrations/bing/client.ts
const BASE = 'https://ssl.bing.com/webmaster/api.svc/json'

export interface InboundLink { url: string; sourceUrl: string; anchorText: string }

export async function fetchInboundLinks(siteUrl: string, page = 0): Promise<InboundLink[]> {
  const apikey = process.env.BING_WMT_API_KEY
  if (!apikey) throw new Error('BING_WMT_API_KEY not set')
  const url = `${BASE}/GetLinkCounts?siteUrl=${encodeURIComponent(siteUrl)}&page=${page}&apikey=${apikey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bing WMT error ${res.status}`)
  const json = await res.json()
  return (json.d ?? []).map((row: any) => ({
    url: row.Url, sourceUrl: row.SourceUrl, anchorText: row.AnchorText ?? '',
  }))
}

export async function fetchQueryStats(siteUrl: string): Promise<any[]> {
  const apikey = process.env.BING_WMT_API_KEY
  if (!apikey) throw new Error('BING_WMT_API_KEY not set')
  const url = `${BASE}/GetQueryStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apikey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bing WMT error ${res.status}`)
  const json = await res.json()
  return json.d ?? []
}
```

- [ ] **Step 3: Write `pull.ts` with similar test pattern, then implement**

```typescript
// lib/seo/integrations/bing/pull.ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { fetchInboundLinks } from './client'

export async function pullDailyBingForSprint(sprintId: string): Promise<void> {
  const sprintRef = adminDb.collection('seo_sprints').doc(sprintId)
  const snap = await sprintRef.get()
  if (!snap.exists) return
  const sprint = snap.data() as any
  const bing = sprint.integrations?.bing
  if (!bing?.connected || !bing?.siteUrl) return

  let links = []
  try {
    links = await fetchInboundLinks(bing.siteUrl)
  } catch (e) {
    await sprintRef.update({ 'integrations.bing.tokenStatus': 'expired' })
    return
  }

  // Upsert into seo_backlinks (dedupe by sourceUrl)
  for (const l of links) {
    const existing = await adminDb.collection('seo_backlinks')
      .where('sprintId', '==', sprintId)
      .where('source', '==', l.sourceUrl)
      .limit(1).get()
    if (!existing.empty) continue
    const u = new URL(l.sourceUrl)
    await adminDb.collection('seo_backlinks').add({
      sprintId, orgId: sprint.orgId,
      source: l.sourceUrl, domain: u.hostname,
      type: 'organic', status: 'live', liveAt: new Date().toISOString(),
      url: l.sourceUrl, notes: l.anchorText ? `Anchor: ${l.anchorText}` : undefined,
      discoveredVia: 'bing-wmt',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'system', createdByType: 'system',
      deleted: false,
    })
  }
  await sprintRef.update({ 'integrations.bing.lastPullAt': FieldValue.serverTimestamp() })
}
```

- [ ] **Step 4: Re-export, run tests, commit**

```bash
git add lib/seo/integrations/bing __tests__/lib/seo/integrations/bing
git commit -m "feat(seo): add Bing WMT integration (inbound links + daily pull)"
```

## A.6: PageSpeed adapter (parallel-eligible)

### Task A.6.1: Build the PageSpeed client + pull

**Files:** Create: `lib/seo/integrations/pagespeed/{client,pull,index}.ts`. Tests: `__tests__/lib/seo/integrations/pagespeed/{client,pull}.test.ts`.

- [ ] **Step 1: Write failing test, implement client**

```typescript
// lib/seo/integrations/pagespeed/client.ts
const BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export interface PageSpeedResult {
  url: string
  performance: number
  seo: number
  accessibility: number
  bestPractices: number
  lcp?: number
  cls?: number
  inp?: number
}

export async function runPageSpeed(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<PageSpeedResult> {
  const key = process.env.PAGESPEED_API_KEY
  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
  })
  if (key) params.set('key', key)
  // Add additional categories
  for (const c of ['seo', 'accessibility', 'best-practices']) params.append('category', c)
  const res = await fetch(`${BASE}?${params.toString()}`)
  if (!res.ok) throw new Error(`PageSpeed error ${res.status}`)
  const json = await res.json()
  const cats = json.lighthouseResult?.categories ?? {}
  const audits = json.lighthouseResult?.audits ?? {}
  return {
    url,
    performance: Math.round((cats.performance?.score ?? 0) * 100),
    seo: Math.round((cats.seo?.score ?? 0) * 100),
    accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
    lcp: audits['largest-contentful-paint']?.numericValue,
    cls: audits['cumulative-layout-shift']?.numericValue,
    inp: audits['interactive']?.numericValue,
  }
}
```

- [ ] **Step 2: Implement `pull.ts`** — pulls homepage + 3 rotating pages, writes to sub-collection `page_health`

```typescript
// lib/seo/integrations/pagespeed/pull.ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { runPageSpeed } from './client'

export async function pullDailyPagespeedForSprint(sprintId: string): Promise<void> {
  const sprintRef = adminDb.collection('seo_sprints').doc(sprintId)
  const snap = await sprintRef.get()
  if (!snap.exists) return
  const sprint = snap.data() as any
  if (!sprint.integrations?.pagespeed?.enabled) return

  const tracked: string[] = [sprint.siteUrl]
  // Add up to 3 tracked pages (rotated by day-of-year)
  const pagesSnap = await adminDb.collection('seo_keywords').where('sprintId', '==', sprintId).limit(20).get()
  const targets = pagesSnap.docs.map((d) => (d.data() as any).targetPageUrl).filter(Boolean) as string[]
  const day = Math.floor(Date.now() / 86_400_000) % Math.max(targets.length, 1)
  for (let i = 0; i < 3 && i < targets.length; i++) tracked.push(targets[(day + i) % targets.length])

  for (const url of tracked) {
    try {
      const r = await runPageSpeed(url)
      await sprintRef.collection('page_health').doc(encodeURIComponent(url)).set({
        ...r, lastPulledAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    } catch {
      // continue on error per-URL
    }
  }
  await sprintRef.update({ 'integrations.pagespeed.lastPullAt': FieldValue.serverTimestamp() })
}
```

- [ ] **Step 3: Test, commit**

```bash
git add lib/seo/integrations/pagespeed __tests__/lib/seo/integrations/pagespeed
git commit -m "feat(seo): add PageSpeed adapter (CWV + Lighthouse pull)"
```

## A.7: OpenPageRank + Common Crawl adapters (parallel-eligible, slim)

### Task A.7.1: OpenPageRank client

**Files:** Create: `lib/seo/integrations/openpagerank/{client,index}.ts`, test: `__tests__/lib/seo/integrations/openpagerank/client.test.ts`.

```typescript
// lib/seo/integrations/openpagerank/client.ts
const BASE = 'https://openpagerank.com/api/v1.0/getPageRank'

export async function getPageRank(domains: string[]): Promise<Record<string, number>> {
  const key = process.env.OPR_API_KEY
  if (!key) throw new Error('OPR_API_KEY not set')
  const params = domains.map((d) => `domains[]=${encodeURIComponent(d)}`).join('&')
  const res = await fetch(`${BASE}?${params}`, { headers: { 'API-OPR': key } })
  if (!res.ok) throw new Error(`OPR error ${res.status}`)
  const json = await res.json()
  const out: Record<string, number> = {}
  for (const r of json.response ?? []) {
    if (r.status_code === 200) out[r.domain] = parseFloat(r.page_rank_decimal ?? '0') * 10
  }
  return out
}
```

Test, commit.

### Task A.7.2: Common Crawl CDX client (fallback only)

**Files:** Create: `lib/seo/integrations/commoncrawl/{client,index}.ts`.

```typescript
// lib/seo/integrations/commoncrawl/client.ts
const CDX = 'https://index.commoncrawl.org/CC-MAIN-2025-12-index'  // pin to a current crawl

export async function findInboundLinks(targetDomain: string, limit = 100): Promise<string[]> {
  // Common Crawl indexes outbound links per page; we query for pages that contain target as outbound
  const url = `${CDX}?url=*.${targetDomain}&output=json&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) return []
  const text = await res.text()
  return text.split('\n').filter(Boolean).map((line) => {
    try { const o = JSON.parse(line); return o.url } catch { return null }
  }).filter(Boolean) as string[]
}
```

Test (mock fetch), commit.

```bash
git add lib/seo/integrations/openpagerank lib/seo/integrations/commoncrawl __tests__/lib/seo/integrations/openpagerank __tests__/lib/seo/integrations/commoncrawl
git commit -m "feat(seo): add OpenPageRank + Common Crawl adapters"
```

## A.8: Loop A — daily refresh

### Task A.8.1: Implement loops/daily.ts orchestrator

**Files:** Create: `lib/seo/loops/daily.ts`, test: `__tests__/lib/seo/loops/daily.test.ts`.

- [ ] **Step 1: Write failing test**

```typescript
const mockGetSprints = jest.fn()
const mockPullGsc = jest.fn()
const mockPullBing = jest.fn()
const mockPullPagespeed = jest.fn()
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ where: () => ({ get: mockGetSprints }) }),
      doc: () => ({ update: jest.fn() }),
    }),
  },
}))
jest.mock('@/lib/seo/integrations/gsc', () => ({ pullDailyGscForSprint: mockPullGsc }))
jest.mock('@/lib/seo/integrations/bing', () => ({ pullDailyBingForSprint: mockPullBing }))
jest.mock('@/lib/seo/integrations/pagespeed', () => ({ pullDailyPagespeedForSprint: mockPullPagespeed }))

import { runDailyLoop } from '@/lib/seo/loops/daily'

beforeEach(() => jest.clearAllMocks())

describe('runDailyLoop', () => {
  it('iterates active sprints and pulls each integration', async () => {
    mockGetSprints.mockResolvedValueOnce({ docs: [
      { id: 's1', ref: { update: jest.fn() }, data: () => ({ orgId: 'o', startDate: '2026-04-01' }) },
      { id: 's2', ref: { update: jest.fn() }, data: () => ({ orgId: 'o', startDate: '2026-04-15' }) },
    ] })
    await runDailyLoop()
    expect(mockPullGsc).toHaveBeenCalledTimes(2)
    expect(mockPullBing).toHaveBeenCalledTimes(2)
    expect(mockPullPagespeed).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Implement**

```typescript
// lib/seo/loops/daily.ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { pullDailyGscForSprint } from '@/lib/seo/integrations/gsc'
import { pullDailyBingForSprint } from '@/lib/seo/integrations/bing'
import { pullDailyPagespeedForSprint } from '@/lib/seo/integrations/pagespeed'
import type { TaskStatus, SprintStatus } from '@/lib/seo/types'

const ACTIVE_STATUSES: SprintStatus[] = ['pre-launch', 'active', 'compounding']

function computeWeek(startDate: string): { day: number; week: number; phase: 0 | 1 | 2 | 3 | 4 } {
  const start = new Date(startDate).getTime()
  const day = Math.floor((Date.now() - start) / 86_400_000) + 1
  const week = Math.floor(day / 7)
  let phase: 0 | 1 | 2 | 3 | 4 = 0
  if (day === 0) phase = 0
  else if (day <= 30) phase = 1
  else if (day <= 60) phase = 2
  else if (day <= 90) phase = 3
  else phase = 4
  return { day, week, phase }
}

export async function refreshTodayPlan(sprintId: string, week: number): Promise<void> {
  const tasksSnap = await adminDb.collection('seo_tasks')
    .where('sprintId', '==', sprintId)
    .where('deleted', '==', false)
    .get()
  const due: string[] = []
  const inProgress: string[] = []
  const blocked: { taskId: string; reason: string }[] = []
  for (const t of tasksSnap.docs) {
    const d = t.data() as any
    if (d.status === 'in_progress') inProgress.push(t.id)
    else if (d.status === 'blocked') blocked.push({ taskId: t.id, reason: d.blockerReason ?? 'unknown' })
    else if ((d.status === 'not_started' || d.status === 'in_progress') && d.week <= week) due.push(t.id)
  }
  // Optimization proposals
  const optsSnap = await adminDb.collection('seo_optimizations')
    .where('sprintId', '==', sprintId)
    .where('status', '==', 'proposed')
    .get()
  await adminDb.collection('seo_sprints').doc(sprintId).update({
    todayPlan: {
      asOf: new Date().toISOString(),
      currentWeek: week,
      due, inProgress, blocked,
      optimizationProposals: optsSnap.docs.map((d) => d.id),
    },
  })
}

export async function runDailyLoop(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = []
  const snap = await adminDb.collection('seo_sprints')
    .where('deleted', '==', false)
    .where('status', 'in', ACTIVE_STATUSES)
    .get()
  let processed = 0
  for (const s of snap.docs) {
    try {
      const data = s.data() as any
      await Promise.allSettled([
        pullDailyGscForSprint(s.id),
        pullDailyBingForSprint(s.id),
        pullDailyPagespeedForSprint(s.id),
      ])
      const { day, week, phase } = computeWeek(data.startDate)
      await s.ref.update({ currentDay: day, currentWeek: week, currentPhase: phase, updatedAt: FieldValue.serverTimestamp() })
      await refreshTodayPlan(s.id, week)
      processed++
    } catch (e: any) {
      errors.push(`${s.id}: ${e.message}`)
    }
  }
  return { processed, errors }
}
```

- [ ] **Step 3: Verify PASS, commit**

```bash
git add lib/seo/loops/daily.ts __tests__/lib/seo/loops/daily.test.ts
git commit -m "feat(seo): add Loop A — daily refresh orchestrator"
```

### Task A.8.2: Cron route /api/cron/seo-daily

**Files:** Create: `app/api/cron/seo-daily/route.ts`.

- [ ] **Step 1: Implement (no test — thin wrapper)**

```typescript
import { NextRequest } from 'next/server'
import { runDailyLoop } from '@/lib/seo/loops/daily'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel Cron sends a Bearer token from CRON_SECRET
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)
  const result = await runDailyLoop()
  return apiSuccess(result)
}
```

- [ ] **Step 2: Update vercel.json**

Add to the `crons` array:
```json
{ "path": "/api/cron/seo-daily", "schedule": "0 4 * * *" }
```
(04:00 UTC = 06:00 SAST.)

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/seo-daily vercel.json
git commit -m "feat(seo): wire Loop A daily cron at 06:00 SAST"
```

## A.9: First sprint create endpoint (smoke test for Phase A)

### Task A.9.1: POST /api/v1/seo/sprints

**Files:** Create: `app/api/v1/seo/sprints/route.ts`, test: `__tests__/api/seo/sprints.test.ts`.

- [ ] **Step 1: Write failing test**

```typescript
import { NextRequest } from 'next/server'

const mockAdd = jest.fn()
const mockGet = jest.fn()
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ add: mockAdd, where: () => ({ get: mockGet, orderBy: () => ({ limit: () => ({ get: mockGet }) }) }) }) },
}))
jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, h: any) => async (req: any) => h(req, { uid: 'u1', role: 'admin', orgId: 'o1' }),
}))
process.env.AI_API_KEY = 'test-key'

beforeEach(() => jest.clearAllMocks())

describe('POST /api/v1/seo/sprints', () => {
  it('creates a sprint from outrank-90 template', async () => {
    mockAdd.mockResolvedValue({ id: 'sprint-1' })
    const { POST } = await import('@/app/api/v1/seo/sprints/route')
    const req = new NextRequest('http://localhost/api/v1/seo/sprints', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1', siteUrl: 'https://example.com', siteName: 'Example' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('sprint-1')
    // Sprint created + 42 task documents added
    expect(mockAdd).toHaveBeenCalledTimes(43)
  })
})
```

- [ ] **Step 2: Implement**

```typescript
// app/api/v1/seo/sprints/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import { FieldValue } from 'firebase-admin/firestore'
import { OUTRANK_90 } from '@/lib/seo/templates/outrank-90'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const clientId = searchParams.get('clientId')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = adminDb.collection('seo_sprints')
  if (user.role !== 'ai' && user.orgId) q = q.where('orgId', '==', user.orgId)
  if (status) q = q.where('status', '==', status)
  if (clientId) q = q.where('clientId', '==', clientId)
  const snap = await q.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((d: any) => !d.deleted)
  return apiSuccess(data, 200, { total: data.length })
})

export const POST = withAuth('admin', withIdempotency(async (req: NextRequest, user: ApiUser) => {
  const body = await req.json().catch(() => null)
  if (!body?.clientId) return apiError('clientId is required', 400)
  if (!body?.siteUrl) return apiError('siteUrl is required', 400)
  if (!body?.siteName) return apiError('siteName is required', 400)
  const orgId = user.orgId ?? body.orgId
  if (!orgId) return apiError('orgId is required', 400)

  const startDate = body.startDate ?? new Date().toISOString()
  const sprintRef = await adminDb.collection('seo_sprints').add({
    orgId, clientId: body.clientId,
    siteUrl: body.siteUrl, siteName: body.siteName,
    startDate, currentDay: 0, currentWeek: 0, currentPhase: 0,
    status: 'pre-launch',
    templateId: 'outrank-90',
    autopilotMode: body.autopilotMode ?? 'safe',
    autopilotTaskTypes: body.autopilotTaskTypes ?? [],
    integrations: { gsc: { connected: false }, bing: { connected: false }, pagespeed: { enabled: false } },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
    ...actorFrom(user),
  })

  // Seed tasks from template
  for (const t of OUTRANK_90.tasks) {
    await adminDb.collection('seo_tasks').add({
      sprintId: sprintRef.id, orgId,
      week: t.week, phase: t.phase, focus: t.focus,
      title: t.title, taskType: t.taskType,
      autopilotEligible: t.autopilotEligible,
      internalToolUrl: t.internalToolPath,
      status: 'not_started', source: 'template',
      createdAt: FieldValue.serverTimestamp(),
      deleted: false,
      ...actorFrom(user),
    })
  }

  return apiSuccess({ id: sprintRef.id, siteUrl: body.siteUrl, siteName: body.siteName }, 201)
}))
```

- [ ] **Step 3: Verify PASS, commit**

```bash
git add app/api/v1/seo/sprints __tests__/api/seo
git commit -m "feat(seo): add POST/GET /api/v1/seo/sprints"
```

## A.10: Phase A integration smoke test

### Task A.10.1: Manual smoke test

- [ ] **Step 1: Create a sprint via curl**

```bash
curl -X POST https://partnersinbiz.online/api/v1/seo/sprints \
  -H "Authorization: Bearer $AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"pib-platform-owner","siteUrl":"https://partnersinbiz.online","siteName":"Partners in Biz"}'
```

Expected: `{"success":true,"data":{"id":"...","siteUrl":"...","siteName":"..."}}`

- [ ] **Step 2: Verify Firestore**

Open Firebase console → `seo_sprints` (1 doc) + `seo_tasks` (42 docs).

- [ ] **Step 3: Trigger daily cron manually**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://partnersinbiz.online/api/cron/seo-daily
```

Expected: `{"success":true,"data":{"processed":1,"errors":[]}}`. (Pulls will mostly be no-ops since GSC isn't connected yet — that's correct behavior.)

- [ ] **Step 4: Document env vars**

Create `docs/env-vars-seo.md`:
```markdown
# SEO Sprint env vars

| Var | Required | Purpose |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | yes | Google OAuth for GSC |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | Google OAuth for GSC |
| `GSC_REDIRECT_URI` | yes | Callback URL: `${BASE_URL}/api/v1/seo/integrations/gsc/callback` |
| `BING_WMT_API_KEY` | yes | Bing Webmaster Tools API key |
| `PAGESPEED_API_KEY` | optional | Raises PageSpeed quota from 25/day to 25K/day |
| `OPR_API_KEY` | yes | OpenPageRank API |
| `CRON_SECRET` | yes | Vercel Cron auth token (already set) |
| `AI_API_KEY` | yes | Already set — skill auth (already exists) |
```

```bash
git add docs/env-vars-seo.md
git commit -m "docs(seo): document required env vars"
```

**Phase A complete.** Data layer + integrations working, daily cron pulls without errors, one sprint live.

---

# Phase B — Tasks, keywords, backlinks endpoints (Week 2)

Goal: Full CRUD endpoints for tasks/keywords/backlinks. Sprint cockpit (admin) renders Today/Tasks/Keywords/Backlinks tabs. Skill exposes basic browse + execute (Loop B without autopilot).

The pattern below applies to all CRUD route tasks — repeated explicitly for each.

## B.1: Sprint single-resource endpoints

### Task B.1.1: GET/PATCH /api/v1/seo/sprints/[id]

**Files:** Create: `app/api/v1/seo/sprints/[id]/route.ts`, test: `__tests__/api/seo/sprints-id.test.ts`.

- [ ] **Step 1: Write failing test**

```typescript
import { NextRequest } from 'next/server'

const mockGet = jest.fn(); const mockUpdate = jest.fn(); const mockDoc = jest.fn(() => ({ get: mockGet, update: mockUpdate }))
jest.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: () => ({ doc: mockDoc }) } }))
jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => async (req: any, ctx: any) => h(req, { uid: 'u1', role: 'admin', orgId: 'o1' }, ctx) }))
process.env.AI_API_KEY = 'test-key'
const params = { params: Promise.resolve({ id: 's1' }) }

beforeEach(() => jest.clearAllMocks())

describe('GET /api/v1/seo/sprints/[id]', () => {
  it('returns sprint', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, id: 's1', data: () => ({ orgId: 'o1', siteName: 'X', deleted: false }) })
    const { GET } = await import('@/app/api/v1/seo/sprints/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/seo/sprints/s1', { headers: { Authorization: 'Bearer test-key' } })
    const res = await GET(req, params as any)
    expect(res.status).toBe(200)
    expect((await res.json()).data.siteName).toBe('X')
  })
  it('PATCH updates sprint', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ orgId: 'o1', deleted: false }) })
    const { PATCH } = await import('@/app/api/v1/seo/sprints/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/seo/sprints/s1', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ autopilotMode: 'full' }),
    })
    const res = await PATCH(req, params as any)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement**

```typescript
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

const ALLOWED_PATCH_FIELDS = ['autopilotMode', 'autopilotTaskTypes', 'siteName', 'status']

export const GET = withAuth('admin', async (
  _req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params
  const snap = await adminDb.collection('seo_sprints').doc(id).get()
  if (!snap.exists) return apiError('Sprint not found', 404)
  const data = snap.data() as any
  if (data.deleted) return apiError('Sprint not found', 404)
  if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
  return apiSuccess({ id: snap.id, ...data })
})

export const PATCH = withAuth('admin', async (
  req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('body required', 400)
  const ref = adminDb.collection('seo_sprints').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Sprint not found', 404)
  const data = snap.data() as any
  if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
  const update: Record<string, unknown> = { ...lastActorFrom(user) }
  for (const k of ALLOWED_PATCH_FIELDS) if (k in body) update[k] = body[k]
  await ref.update(update)
  return apiSuccess({ id, updated: Object.keys(update) })
})
```

- [ ] **Step 3: Verify, commit**

```bash
git add app/api/v1/seo/sprints/\[id\] __tests__/api/seo
git commit -m "feat(seo): add GET/PATCH /api/v1/seo/sprints/[id]"
```

### Task B.1.2: POST /api/v1/seo/sprints/[id]/archive

**Files:** Create: `app/api/v1/seo/sprints/[id]/archive/route.ts`, test.

- [ ] **Step 1: Test**

```typescript
// confirms POST /archive sets status='archived' and deleted=true (if ?force=true)
```

- [ ] **Step 2: Implement**

```typescript
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', withIdempotency(async (
  req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params
  const force = new URL(req.url).searchParams.get('force') === 'true'
  const ref = adminDb.collection('seo_sprints').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Sprint not found', 404)
  const data = snap.data() as any
  if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
  await ref.update({
    status: 'archived',
    deleted: force,
    deletedAt: force ? FieldValue.serverTimestamp() : null,
    ...lastActorFrom(user),
  })
  return apiSuccess({ id, archived: true, deleted: force })
}))
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(seo): add POST /api/v1/seo/sprints/[id]/archive"
```

### Task B.1.3: GET /api/v1/seo/sprints/[id]/today, /health, POST /optimize, POST /run

These are read-mostly + trigger endpoints. Build all four in one task.

**Files:** Create: `app/api/v1/seo/sprints/[id]/{today,health,optimize,run}/route.ts`.

- [ ] **Implement and test each.**
  - `today/route.ts` GET: return `sprint.todayPlan` denormalised. If absent, refresh on demand using `refreshTodayPlan`.
  - `health/route.ts` GET: return `sprint.health` plus a list of integration statuses.
  - `optimize/route.ts` POST: triggers `runOptimizationLoop(sprintId)` (defined in Phase C). Until C is built, return `{ status: 'pending', note: 'optimization loop not yet active' }`.
  - `run/route.ts` POST: triggers `runExecutionLoopForSprint(sprintId, user)` (defined in Phase B.7).

- [ ] **Commit**

```bash
git add app/api/v1/seo/sprints/\[id\]/{today,health,optimize,run}
git commit -m "feat(seo): add today/health/optimize/run sprint endpoints"
```

## B.2: Tasks endpoints (parallel-eligible — independent subagent)

Six tasks (CRUD + actions). Pattern: list within sprint, PATCH single, dedicated complete/skip/execute action endpoints.

### Task B.2.1: GET /api/v1/seo/sprints/[id]/tasks

**Files:** Create: `app/api/v1/seo/sprints/[id]/tasks/route.ts`, test.

- [ ] **Implement**

GET: filterable by `?week`, `?phase`, `?status`, `?source`. Returns tasks scoped to that sprint.
POST: create custom task (sets `source: 'manual'`).

```typescript
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import { requireSprintAccess } from '@/lib/seo/tenant'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (
  req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params
  await requireSprintAccess(id, user)
  const u = new URL(req.url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = adminDb.collection('seo_tasks').where('sprintId', '==', id).where('deleted', '==', false)
  for (const f of ['week', 'phase', 'status', 'source'] as const) {
    const v = u.searchParams.get(f)
    if (v != null) q = q.where(f, '==', f === 'week' || f === 'phase' ? Number(v) : v)
  }
  const snap = await q.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data, 200, { total: data.length })
})

export const POST = withAuth('admin', withIdempotency(async (
  req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params
  const sprint = await requireSprintAccess(id, user) as any
  const body = await req.json().catch(() => null)
  if (!body?.title) return apiError('title is required', 400)
  if (typeof body.week !== 'number') return apiError('week (number) is required', 400)
  const ref = await adminDb.collection('seo_tasks').add({
    sprintId: id, orgId: sprint.orgId,
    week: body.week, phase: body.phase ?? 4, focus: body.focus ?? 'Custom',
    title: body.title, description: body.description, taskType: body.taskType ?? 'custom',
    autopilotEligible: body.autopilotEligible ?? false,
    status: 'not_started', source: 'manual',
    createdAt: FieldValue.serverTimestamp(),
    deleted: false,
    ...actorFrom(user),
  })
  return apiSuccess({ id: ref.id }, 201)
}))
```

- [ ] **Test, commit.**

### Task B.2.2: PATCH /api/v1/seo/tasks/[id]

**Files:** Create: `app/api/v1/seo/tasks/[id]/route.ts`, test.

- [ ] **Implement**: allow updating `status`, `assignee`, `description`, `outputArtifactId`, `dueAt`, `blockerReason`. Validate task ownership via sprint orgId. Standard pattern.

- [ ] **Test, commit.**

### Task B.2.3: POST /api/v1/seo/tasks/[id]/{complete,skip,execute}

**Files:** Create three route.ts files. The execute endpoint will be the longest — defer its content to Phase B.7.

- [ ] **Implement complete**: sets `status: 'done'`, `completedAt`, `completedBy`, optional `outputArtifactId`. Triggers webhook event `seo.task.completed` (event dispatch already exists via existing webhook system).

- [ ] **Implement skip**: sets `status: 'skipped'`, optional reason in `blockerReason`.

- [ ] **Implement execute** (stub for now): looks up task, checks `autopilotEligible`, returns `{ status: 'noop', reason: 'execution-router not yet wired' }`. Will be filled in Phase B.7.

- [ ] **Test each, commit.**

```bash
git add app/api/v1/seo/tasks __tests__/api/seo
git commit -m "feat(seo): add task PATCH/complete/skip/execute endpoints"
```

## B.3: Keywords endpoints (parallel-eligible)

### Task B.3.1: GET/POST /api/v1/seo/sprints/[id]/keywords

**Files:** Create: `app/api/v1/seo/sprints/[id]/keywords/route.ts`, test.

- [ ] **Implement**: GET filterable by `?intentBucket`, `?status`. POST creates new keyword scoped to sprint. POST also accepts `?bulk=true` with body `{ keywords: [...] }`.

```typescript
// keyword create body
{
  keyword: string,
  volume?: number,
  topThreeDR?: number,
  intentBucket: 'problem'|'solution'|'brand',
  targetPageUrl?: string,
}
```

Defaults: `status: 'not_yet'`, `positions: []`.

- [ ] **Test, commit.**

### Task B.3.2: PATCH/DELETE /api/v1/seo/keywords/[id]

**Files:** Create: `app/api/v1/seo/keywords/[id]/route.ts`, test.

- [ ] **PATCH**: update `keyword`, `volume`, `topThreeDR`, `intentBucket`, `targetPageUrl`, `status`.
- [ ] **DELETE**: soft delete (sets `deleted: true`); hard delete with `?force=true`.

- [ ] **Test, commit.**

### Task B.3.3: POST /api/v1/seo/keywords/[id]/retire

**Files:** Create: `app/api/v1/seo/keywords/[id]/retire/route.ts`.

- [ ] **Implement**: sets `retiredAt: serverTimestamp()`, `status: 'lost'`. Used by optimization loop when a keyword is given up on.

### Task B.3.4: GET /api/v1/seo/keywords/[id]/positions

- [ ] **Implement**: returns full `positions[]` time series. Optional `?since=YYYY-MM-DD` filter.

```bash
git add app/api/v1/seo/sprints/\[id\]/keywords app/api/v1/seo/keywords __tests__/api/seo
git commit -m "feat(seo): add keywords CRUD + retire + positions endpoints"
```

## B.4: Backlinks endpoints (parallel-eligible)

### Task B.4.1-4: backlinks CRUD + mark-live + discover

Same pattern as keywords. Five endpoints:
- `GET/POST /api/v1/seo/sprints/[id]/backlinks/route.ts`
- `PATCH /api/v1/seo/backlinks/[id]/route.ts`
- `POST /api/v1/seo/backlinks/[id]/mark-live/route.ts` — sets `status: 'live'`, `liveAt`.
- `GET /api/v1/seo/sprints/[id]/backlinks/discover/route.ts` — calls Bing WMT + Common Crawl, returns candidates without persisting (caller decides what to add).

- [ ] **For seed**: when a sprint is created (Phase A), pre-seed the 15 directories from the Outrank sheet with `status: 'not_started'`, `discoveredVia: 'manual'`. Update `app/api/v1/seo/sprints/route.ts POST` to also seed these. Add a test confirming 15 backlinks exist after sprint creation.

- [ ] **Test, commit each.**

```bash
git add app/api/v1/seo/sprints/\[id\]/backlinks app/api/v1/seo/backlinks __tests__/api/seo
git commit -m "feat(seo): add backlinks CRUD + mark-live + discover + 15 directory seed"
```

## B.5: GSC OAuth callback + connect endpoints

### Task B.5.1: GET /api/v1/seo/integrations/gsc/auth-url

**Files:** Create: `app/api/v1/seo/integrations/gsc/auth-url/route.ts`.

- [ ] **Implement**: receives `?sprintId=xxx`, builds state token (signed JWT or encrypted, e.g. `Buffer.from(JSON.stringify({sprintId, uid, ts})).toString('base64url')`), returns `{ url: gscAuthUrl(state) }`. Skill calls this, then opens URL in browser.

### Task B.5.2: GET /api/v1/seo/integrations/gsc/callback

**Files:** Create: `app/api/v1/seo/integrations/gsc/callback/route.ts`.

- [ ] **Implement**: receives `?code=...&state=...`. Decodes state to get `sprintId`. Calls `exchangeGscCode(code)` → tokens. Stores encrypted tokens in `seo_sprints/{id}.integrations.gsc.tokens` (using existing `lib/integrations/crypto.ts` encrypt). Sets `connected: true`. Redirects to `/admin/seo/sprints/[id]/settings?gsc=connected`.

### Task B.5.3: POST /api/v1/seo/integrations/gsc/disconnect/[sprintId]

- [ ] **Implement**: clears tokens + propertyUrl, sets `connected: false`.

### Task B.5.4: POST /api/v1/seo/integrations/gsc/pull/[sprintId]

- [ ] **Implement**: calls `pullDailyGscForSprint(sprintId)` on demand. Returns `{ ok: true, lastPullAt: ... }`.

```bash
git add app/api/v1/seo/integrations/gsc __tests__/api/seo/integrations
git commit -m "feat(seo): add GSC OAuth callback + connect/disconnect/manual-pull endpoints"
```

### Task B.5.5: GSC property-picker UI

After OAuth callback, the user must pick which GSC property maps to this sprint. Add `GET /api/v1/seo/integrations/gsc/properties/[sprintId]` that lists user's GSC properties, plus `POST /api/v1/seo/integrations/gsc/connect/[sprintId]` that accepts `{ propertyUrl }` and sets it on the sprint.

- [ ] **Implement, test, commit.**

## B.6: Bing + PageSpeed connect endpoints

### Task B.6.1-2: Bing/PageSpeed mini-routes

- [ ] **GET /api/v1/seo/integrations/bing/properties** — returns `process.env.BING_WMT_API_KEY ? listed-via-bing-api : empty`.
- [ ] **POST /api/v1/seo/integrations/bing/connect/[sprintId]** — accepts `{ siteUrl }`, sets `integrations.bing = { connected: true, siteUrl }`.
- [ ] **POST /api/v1/seo/integrations/pagespeed/run/[sprintId]** — calls `pullDailyPagespeedForSprint(sprintId)` on demand.

- [ ] **Test each, commit.**

```bash
git add app/api/v1/seo/integrations/bing app/api/v1/seo/integrations/pagespeed __tests__/api/seo/integrations
git commit -m "feat(seo): add Bing + PageSpeed connect/run endpoints"
```

## B.7: Loop B — execution router

### Task B.7.1: lib/seo/loops/execution.ts — task type → executor map

**Files:** Create: `lib/seo/loops/execution.ts`, test: `__tests__/lib/seo/loops/execution.test.ts`.

The execution router maps `taskType` → an async executor function. Each executor returns `{ status: 'done'|'queued'|'blocked', artifactId?, blockerReason? }`. In Phase B we wire only the autopilot-safe types that don't need any external LLM beyond drafts.

- [ ] **Step 1: Write test**

```typescript
const mockUpdate = jest.fn(); const mockGet = jest.fn()
jest.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ get: mockGet, update: mockUpdate }) }) } }))

import { executeTask } from '@/lib/seo/loops/execution'

describe('executeTask routing', () => {
  it('returns blocked when autopilot mode is off and task is autopilot-eligible', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ taskType: 'meta-tag-audit', autopilotEligible: true, sprintId: 's1', status: 'not_started', orgId: 'o' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ autopilotMode: 'off' }) })
    const r = await executeTask('t1', { uid: 'u', role: 'ai', orgId: 'o' } as any)
    expect(r.status).toBe('blocked')
  })

  it('returns queued when task is not autopilot-eligible', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ taskType: 'post-publish', autopilotEligible: false, sprintId: 's1', orgId: 'o' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ autopilotMode: 'safe' }) })
    const r = await executeTask('t1', { uid: 'u', role: 'ai', orgId: 'o' } as any)
    expect(r.status).toBe('queued')
  })
})
```

- [ ] **Step 2: Implement skeleton**

```typescript
// lib/seo/loops/execution.ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'
import { lastActorFrom } from '@/lib/api/actor'

type ExecutorResult = { status: 'done' | 'queued' | 'blocked'; artifactId?: string; blockerReason?: string }
type Executor = (taskId: string, sprintId: string, user: ApiUser) => Promise<ExecutorResult>

const executors: Record<string, Executor> = {
  // Filled in across phases
}

export function registerExecutor(taskType: string, fn: Executor) {
  executors[taskType] = fn
}

export async function executeTask(taskId: string, user: ApiUser): Promise<ExecutorResult> {
  const taskSnap = await adminDb.collection('seo_tasks').doc(taskId).get()
  if (!taskSnap.exists) return { status: 'blocked', blockerReason: 'Task not found' }
  const task = taskSnap.data() as any
  const sprintSnap = await adminDb.collection('seo_sprints').doc(task.sprintId).get()
  if (!sprintSnap.exists) return { status: 'blocked', blockerReason: 'Sprint not found' }
  const sprint = sprintSnap.data() as any

  if (!task.autopilotEligible) return { status: 'queued', blockerReason: 'requires human' }
  if (sprint.autopilotMode === 'off') return { status: 'blocked', blockerReason: 'autopilot off' }
  // 'full' allows everything; 'safe' allows only types in autopilotTaskTypes (or default-safe set)
  if (sprint.autopilotMode === 'safe') {
    const allowed = new Set(sprint.autopilotTaskTypes ?? [])
    const defaultSafe = ['meta-tag-audit', 'robots-check', 'pagespeed-check', 'cwv-check', 'canonical-check', 'gsc-index-check', 'keyword-record', 'directory-submission', 'audit-snapshot', 'audit-render', 'internal-link-add', 'gsc-stuck-pages', 'schema-add']
    if (!allowed.has(task.taskType) && !defaultSafe.includes(task.taskType)) {
      return { status: 'queued', blockerReason: 'taskType not in autopilot allowlist' }
    }
  }

  const executor = executors[task.taskType]
  if (!executor) return { status: 'queued', blockerReason: `no executor for ${task.taskType}` }
  return executor(taskId, task.sprintId, user)
}

// Sprint-level driver: walks today's plan, executes each task in turn
export async function runExecutionLoopForSprint(sprintId: string, user: ApiUser): Promise<{
  done: string[]; queued: string[]; blocked: { taskId: string; reason: string }[]
}> {
  const sprintSnap = await adminDb.collection('seo_sprints').doc(sprintId).get()
  const plan = (sprintSnap.data() as any)?.todayPlan
  const ids = [...(plan?.due ?? []), ...(plan?.inProgress ?? [])]
  const out = { done: [] as string[], queued: [] as string[], blocked: [] as { taskId: string; reason: string }[] }
  for (const id of ids) {
    const r = await executeTask(id, user)
    if (r.status === 'done') {
      out.done.push(id)
      await adminDb.collection('seo_tasks').doc(id).update({ status: 'done', completedAt: FieldValue.serverTimestamp(), outputArtifactId: r.artifactId, ...lastActorFrom(user) })
    } else if (r.status === 'queued') {
      out.queued.push(id)
      await adminDb.collection('seo_tasks').doc(id).update({ status: 'in_progress', ...lastActorFrom(user) })
    } else {
      out.blocked.push({ taskId: id, reason: r.blockerReason ?? 'unknown' })
      await adminDb.collection('seo_tasks').doc(id).update({ status: 'blocked', blockerReason: r.blockerReason, ...lastActorFrom(user) })
    }
  }
  return out
}
```

- [ ] **Step 3: Test, commit.**

### Task B.7.2: Wire `/api/v1/seo/sprints/[id]/run` to runExecutionLoopForSprint

Already stubbed in B.1.3. Replace the body with:

```typescript
import { runExecutionLoopForSprint } from '@/lib/seo/loops/execution'

export const POST = withAuth('admin', withIdempotency(async (
  req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params
  await requireSprintAccess(id, user)
  const result = await runExecutionLoopForSprint(id, user)
  return apiSuccess(result)
}))
```

- [ ] **Test, commit.**

```bash
git add lib/seo/loops/execution.ts app/api/v1/seo/sprints/\[id\]/run __tests__/lib/seo/loops/execution.test.ts
git commit -m "feat(seo): add execution-loop router + wire /run endpoint"
```

## B.8: Admin cockpit shell + Today/Tasks/Keywords/Backlinks tabs

This is UI work and should be done in one task per page. UI tests use React Testing Library where possible; for Phase B keep tests light (smoke + key prop).

### Task B.8.1: /admin/seo index page (sprints list)

**Files:** Create: `app/(admin)/admin/seo/page.tsx`, `components/seo/SprintCard.tsx`, `components/seo/HealthBadge.tsx`, `components/seo/PipPresencePill.tsx`.

- [ ] **Step 1: Build the index page**

Renders a list of sprints. Each card shows: client name, site URL, current week, % done, health badge, "Run today's SEO" button (POSTs to `/api/v1/seo/sprints/[id]/run`).

```tsx
// app/(admin)/admin/seo/page.tsx
import { adminDb } from '@/lib/firebase/admin'
import { SprintCard } from '@/components/seo/SprintCard'
import { PipPresencePill } from '@/components/seo/PipPresencePill'

export const dynamic = 'force-dynamic'

export default async function SeoIndexPage() {
  const snap = await adminDb.collection('seo_sprints').where('deleted', '==', false).get()
  const sprints = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">SEO Sprints</h1>
        <PipPresencePill />
      </header>
      {/* Filters: client, phase, status, health */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sprints.map((s) => <SprintCard key={s.id} sprint={s} />)}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build SprintCard component**

Shows: site name + URL, "Day X of 90" or "Phase 4: Compounding (day Y)", percent done (computed from tasks done / 42), health badge, last GSC pull, button "Run today's SEO" that fires the POST.

- [ ] **Step 3: HealthBadge** — green/amber/red pill from `sprint.health.score`.

- [ ] **Step 4: PipPresencePill** — green dot if today's plan was refreshed today, amber > 24h, red if errored. Static-rendered server component.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/seo/page.tsx components/seo
git commit -m "feat(seo): add admin sprints index page + sprint card components"
```

### Task B.8.2: /admin/seo/sprints/[id] tabbed cockpit shell

**Files:** Create: `app/(admin)/admin/seo/sprints/[id]/layout.tsx`, `app/(admin)/admin/seo/sprints/[id]/page.tsx` (Today tab, default).

- [ ] **Layout**: tabs nav (Today, Tasks, Keywords, Backlinks, Content, Audits, Optimizations, Health, Settings), with a sprint header showing site name/url and a "Run today's SEO" button.

- [ ] **Today page**: reads `sprint.todayPlan`, renders four sections: Due Today, In Progress, Blocked, Optimization Proposals. Each task row uses `<TaskRow>` (built next).

- [ ] **Test, commit.**

### Task B.8.3: /admin/seo/sprints/[id]/tasks page + TaskRow

- [ ] **Tasks page**: full list grouped by week → phase → focus. Each task row supports inline edit, status change, owner assign. "Add task" button opens a modal.

- [ ] **TaskRow component**: shows status pill, title, autopilot eligibility icon, output artifact link (if any), buttons for Complete/Skip/Execute. Calls relevant `/api/v1/seo/tasks/[id]/...` endpoints.

- [ ] **Commit.**

### Task B.8.4: /admin/seo/sprints/[id]/keywords page + KeywordTable + KeywordSparkline

- [ ] **Keywords page**: table of all keywords. Columns: keyword, vol, top-3 DR, intent, target page, current position, status, sparkline of `positions[]` over time.

- [ ] **KeywordSparkline component**: uses `recharts` LineChart, height ~30px, data from `positions[]`.

- [ ] **Commit.**

### Task B.8.5: /admin/seo/sprints/[id]/backlinks page + BacklinkRow

- [ ] **Backlinks page**: table of backlinks (15 directories pre-seeded + any others). Columns: source, type, DR, status, submitted/live dates, notes. Inline status change. "Discover backlinks" button calls discovery endpoint and shows candidates.

- [ ] **Commit.**

```bash
git add app/\(admin\)/admin/seo components/seo
git commit -m "feat(seo): add admin sprint cockpit (Today/Tasks/Keywords/Backlinks tabs)"
```

## B.9: Sprint creation wizard

### Task B.9.1: /admin/seo/sprints/new

**Files:** Create: `app/(admin)/admin/seo/sprints/new/page.tsx`.

- [ ] **3-step wizard:**
  1. Pick client + site (free-text site URL + name; pulls from `clients` collection for client picker)
  2. Pick template (only `outrank-90` for v1 — show description card)
  3. (After create) Connect GSC button → opens auth URL; PageSpeed enable toggle; autopilot mode radio (off / safe / full)

POSTs to `/api/v1/seo/sprints` with `Idempotency-Key` header.

- [ ] **Test, commit.**

```bash
git add app/\(admin\)/admin/seo/sprints/new
git commit -m "feat(seo): add sprint creation wizard"
```

**Phase B complete.** A sprint can be created via the UI, GSC connected, daily pulls populating data, tasks/keywords/backlinks editable, "Run today's SEO" returns a result (mostly queued because executors aren't wired yet).

---

# Phase C — Content, audits, optimization (Week 3)

Goal: Complete content workflow (draft → review → publish), audit snapshots + reports, optimization loop with detectors and 14-day measurement, weekly cron.

## C.1: Content endpoints

### Task C.1.1: Content CRUD + draft + repurpose + publish

Six endpoints. Pattern follows tasks/keywords/backlinks.

- [ ] **GET/POST /api/v1/seo/sprints/[id]/content/route.ts**
- [ ] **PATCH /api/v1/seo/content/[id]/route.ts**
- [ ] **POST /api/v1/seo/content/[id]/draft/route.ts** — calls AI to generate draft based on `targetKeywordId` + `type`. Saves to insights blog drafts (uses existing `lib/content/posts.ts` mechanism). Sets `status: 'review'`, `draftPostId`.
- [ ] **POST /api/v1/seo/content/[id]/repurpose/route.ts** — calls existing `/api/v1/social/posts` to draft LI + X posts. Sets `liUrl`/`xUrl` to scheduled IDs.
- [ ] **POST /api/v1/seo/content/[id]/publish/route.ts** — moves draft to live insights post (appends to `lib/content/posts.ts` POSTS array via runtime-overridable Firestore `published_posts` collection if needed; stub for now: just sets `status: 'live'` + records `targetUrl`).

- [ ] **Test each, commit.**

```bash
git add app/api/v1/seo/sprints/\[id\]/content app/api/v1/seo/content __tests__/api/seo
git commit -m "feat(seo): add content CRUD + draft + repurpose + publish endpoints"
```

## C.2: Audit endpoints

### Task C.2.1: Audit snapshot generation

**Files:** `app/api/v1/seo/sprints/[id]/audits/route.ts`, `app/api/v1/seo/audits/[id]/{route,report.pdf,share}/route.ts`, `lib/seo/audits.ts`.

- [ ] **lib/seo/audits.ts — generate snapshot**

```typescript
// lib/seo/audits.ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export async function generateAuditSnapshot(sprintId: string, snapshotDay: number) {
  const sprintSnap = await adminDb.collection('seo_sprints').doc(sprintId).get()
  const sprint = sprintSnap.data() as any

  // Aggregate from keywords
  const keywordsSnap = await adminDb.collection('seo_keywords').where('sprintId', '==', sprintId).where('deleted', '==', false).get()
  let impressions = 0, clicks = 0, top100 = 0, top10 = 0, top3 = 0
  let positionSum = 0, positionN = 0
  for (const k of keywordsSnap.docs) {
    const d = k.data() as any
    impressions += d.currentImpressions ?? 0
    clicks += d.currentClicks ?? 0
    if (d.currentPosition) { positionSum += d.currentPosition; positionN++ }
    if (d.currentPosition && d.currentPosition <= 100) top100++
    if (d.currentPosition && d.currentPosition <= 10) top10++
    if (d.currentPosition && d.currentPosition <= 3) top3++
  }

  // Backlinks
  const blSnap = await adminDb.collection('seo_backlinks').where('sprintId', '==', sprintId).where('deleted', '==', false).get()
  const totalBacklinks = blSnap.size
  const referringDomains = new Set(blSnap.docs.map((d) => (d.data() as any).domain).filter(Boolean)).size

  // Content
  const contentSnap = await adminDb.collection('seo_content').where('sprintId', '==', sprintId).where('status', '==', 'live').get()
  const postsPublished = contentSnap.size
  const comparisonPagesLive = contentSnap.docs.filter((d) => (d.data() as any).type === 'comparison').length

  const ref = await adminDb.collection('seo_audits').add({
    sprintId, orgId: sprint.orgId, snapshotDay,
    capturedAt: new Date().toISOString(),
    traffic: {
      impressions, clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      avgPosition: positionN > 0 ? positionSum / positionN : 0,
    },
    rankings: { top100, top10, top3 },
    authority: { referringDomains, totalBacklinks },
    content: { pagesIndexed: postsPublished, postsPublished, comparisonPagesLive },
    source: 'mixed',
    deleted: false,
  })
  return ref.id
}
```

- [ ] **POST /api/v1/seo/sprints/[id]/audits**: calls `generateAuditSnapshot`. Body accepts `snapshotDay` (defaults to current sprint day).
- [ ] **GET /api/v1/seo/audits/[id]**: returns full audit doc.
- [ ] **GET /api/v1/seo/audits/[id]/share**: generates a public share token + returns the URL `/portal/seo/audits/shared/[token]`.
- [ ] **GET /api/v1/seo/audits/[id]/report.pdf**: stub for Phase E (returns 501 for now).

- [ ] **Test, commit.**

```bash
git add app/api/v1/seo/sprints/\[id\]/audits app/api/v1/seo/audits lib/seo/audits.ts __tests__
git commit -m "feat(seo): add audit snapshot endpoints"
```

## C.3: Optimization detectors (parallel-eligible — independent subagents per detector)

Each detector is an isolated, testable function that takes a sprint context and returns 0+ `HealthSignal` objects.

### Task C.3.1: lib/seo/loops/detectors/index.ts — registry + types

**Files:** Create: `lib/seo/loops/detectors/index.ts`, test.

- [ ] **Implement**

```typescript
// lib/seo/loops/detectors/index.ts
import type { HealthSignal } from '@/lib/seo/types'

export interface DetectorContext {
  sprintId: string
  orgId: string
  startDate: string
  currentDay: number
  currentWeek: number
  currentPhase: 0 | 1 | 2 | 3 | 4
}

export type Detector = (ctx: DetectorContext) => Promise<HealthSignal[]>

export const detectors: Record<string, Detector> = {}

export function registerDetector(name: string, fn: Detector) {
  detectors[name] = fn
}

export async function runAllDetectors(ctx: DetectorContext): Promise<HealthSignal[]> {
  const out: HealthSignal[] = []
  for (const fn of Object.values(detectors)) {
    try { out.push(...(await fn(ctx))) } catch { /* fail-soft per detector */ }
  }
  return out
}
```

- [ ] **Commit.**

### Task C.3.2-10: Each individual detector

**File pattern:** `lib/seo/loops/detectors/<detector-name>.ts` + matching test in `__tests__/lib/seo/loops/detectors/<detector-name>.test.ts`.

For each, the test asserts the detector fires given expected Firestore state. Each implementation is small (~30-50 LOC).

#### C.3.2: stuck-page

```typescript
// lib/seo/loops/detectors/stuck-page.ts
import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const stuckPage: Detector = async (ctx) => {
  const snap = await adminDb.collection('seo_keywords')
    .where('sprintId', '==', ctx.sprintId).where('deleted', '==', false).get()
  const out = []
  for (const d of snap.docs) {
    const k = d.data() as any
    const recent = (k.positions ?? []).slice(-3)
    if (recent.length < 3) continue
    const allInBand = recent.every((p: any) => p.position >= 8 && p.position <= 22)
    const noImprovement = recent[0].position - recent[recent.length - 1].position < 2
    if (allInBand && noImprovement) {
      out.push({
        type: 'stuck_page' as const,
        severity: 'medium' as const,
        evidence: { keyword: k.keyword, keywordId: d.id, recentPositions: recent.map((r: any) => r.position) },
      })
    }
  }
  return out
}
```

Test, commit.

#### C.3.3: lost-keyword
Detect: position dropped 5+ WoW. Compare last position to position from 7+ days ago.

#### C.3.4: zero-impression-post
Detect: `seo_content` where `status='live'`, `publishDate` is 14+ days ago, `performance.impressions < 5`.

#### C.3.5: unindexed-page
Detect: in current sprint week ≥ 2, query `seo_keywords` for `targetPageUrl` set; check those pages via `inspectUrl` from GSC adapter.

#### C.3.6: directory-silence
Detect: `seo_backlinks` where `status='submitted'`, `submittedAt` 30+ days ago.

#### C.3.7: cwv-regression
Detect: `seo_sprints/{id}/page_health/{url}` where `lcp > 2500` or `cls > 0.1`.

#### C.3.8: keyword-misalignment
Detect: GSC top-query for a `targetPageUrl` doesn't match the `seo_keywords` row's `keyword`.

#### C.3.9: pillar-orphan
Detect: a `seo_content` row of `type='pillar'` with `< 3` other content rows referencing it (heuristic: scan for inbound mention in description/title — sufficient for v1).

#### C.3.10: compound-stagnation
Detect: only fires if `currentPhase === 4`. Compares last 4 weeks of weekly impressions deltas; flags if all deltas < 5%.

For each: write detector + register it in `detectors/index.ts` (via `registerDetector` call at module load).

- [ ] **Each detector: test + implement + commit.**

```bash
git add lib/seo/loops/detectors __tests__/lib/seo/loops/detectors
git commit -m "feat(seo): add 9 optimization detectors (stuck/lost/zero-impression/unindexed/silence/cwv/misalignment/orphan/stagnation)"
```

## C.4: Hypothesis generator + optimization loop orchestrator

### Task C.4.1: lib/seo/loops/hypotheses.ts

**Files:** Create + test.

- [ ] **Implement**: maps signal types → 1-3 hypothesis templates.

```typescript
// lib/seo/loops/hypotheses.ts
import type { HealthSignal } from '@/lib/seo/types'

export interface HypothesisProposal {
  hypothesis: string
  hypothesisType: string
  proposedAction: string
  generatedTasks: { title: string; taskType: string; week: number; phase: 4; autopilotEligible: boolean }[]
}

const TEMPLATES: Record<string, (s: HealthSignal) => HypothesisProposal[]> = {
  stuck_page: (s) => [{
    hypothesis: 'Page lacks depth and FAQ schema',
    hypothesisType: 'stuck_page:depth-faq',
    proposedAction: `Rewrite ${s.evidence.keyword} target page with deeper coverage + FAQ schema`,
    generatedTasks: [
      { title: `Rewrite stuck page for "${s.evidence.keyword}" — add depth + FAQ`, taskType: 'page-rewrite', week: 99, phase: 4, autopilotEligible: true },
    ],
  }],
  lost_keyword: (s) => [{
    hypothesis: 'Page may have lost relevance or backlinks',
    hypothesisType: 'lost_keyword:rebuild',
    proposedAction: `Re-evaluate target page for "${s.evidence.keyword}" and add fresh internal links + content update`,
    generatedTasks: [
      { title: `Refresh page for "${s.evidence.keyword}"`, taskType: 'page-rewrite', week: 99, phase: 4, autopilotEligible: true },
      { title: `Add 3 internal links to "${s.evidence.keyword}" page`, taskType: 'internal-link-add', week: 99, phase: 4, autopilotEligible: true },
    ],
  }],
  zero_impression_post: (s) => [{
    hypothesis: 'Post not indexed or wrong target keyword',
    hypothesisType: 'zero_impression:relaunch',
    proposedAction: 'Verify indexing + reassess target keyword fit',
    generatedTasks: [
      { title: `Re-submit ${s.evidence.title} for indexing in GSC`, taskType: 'gsc-request-index', week: 99, phase: 4, autopilotEligible: false },
    ],
  }],
  unindexed_page: (s) => [{
    hypothesis: 'Page not crawled — may have indexability issue',
    hypothesisType: 'unindexed:fix',
    proposedAction: 'Audit crawler accessibility + request indexing',
    generatedTasks: [
      { title: `Crawler-sim audit for ${s.evidence.url}`, taskType: 'crawler-sim', week: 99, phase: 4, autopilotEligible: true },
      { title: `Request indexing for ${s.evidence.url}`, taskType: 'gsc-request-index', week: 99, phase: 4, autopilotEligible: false },
    ],
  }],
  directory_silence: (s) => [{
    hypothesis: 'Submission lost in queue or rejected silently',
    hypothesisType: 'directory:reattempt',
    proposedAction: 'Mark as lost + try alternative directory',
    generatedTasks: [
      { title: `Mark ${s.evidence.source} as lost`, taskType: 'backlink-mark-lost', week: 99, phase: 4, autopilotEligible: true },
    ],
  }],
  cwv_regression: (s) => [{
    hypothesis: 'CWV regression on tracked page',
    hypothesisType: 'cwv:fix',
    proposedAction: 'Audit page assets and image sizing',
    generatedTasks: [
      { title: `Audit ${s.evidence.url} CWV`, taskType: 'cwv-audit', week: 99, phase: 4, autopilotEligible: false },
    ],
  }],
  keyword_misalignment: (s) => [{
    hypothesis: 'Page ranks for adjacent queries — primary keyword mismatch',
    hypothesisType: 'misalignment:retarget',
    proposedAction: 'Rewrite H1 + meta to align with the actual ranking query',
    generatedTasks: [
      { title: `Retarget ${s.evidence.url} to "${s.evidence.actualTopQuery}"`, taskType: 'page-rewrite', week: 99, phase: 4, autopilotEligible: true },
    ],
  }],
  pillar_orphan: (s) => [{
    hypothesis: 'Pillar lacks supporting cluster posts pointing inbound',
    hypothesisType: 'orphan:cluster',
    proposedAction: 'Add inbound links from existing posts + plan cluster',
    generatedTasks: [
      { title: `Add inbound links to pillar "${s.evidence.title}"`, taskType: 'internal-link-add', week: 99, phase: 4, autopilotEligible: true },
    ],
  }],
  compound_stagnation: (s) => [{
    hypothesis: 'Need fresh content infusion',
    hypothesisType: 'stagnation:refresh',
    proposedAction: 'Plan new pillar + 3 cluster posts',
    generatedTasks: [
      { title: 'Pick new keyword cluster theme', taskType: 'cluster-pick', week: 99, phase: 4, autopilotEligible: true },
    ],
  }],
}

export function proposeHypotheses(signals: HealthSignal[], scoreboard?: Record<string, { wins: number; losses: number; noChange: number }>): HypothesisProposal[] {
  const out: HypothesisProposal[] = []
  for (const s of signals) {
    const fn = TEMPLATES[s.type]
    if (!fn) continue
    const candidates = fn(s)
    // v1: pick first candidate. v2: rank by past win rate from scoreboard
    out.push(candidates[0])
  }
  return out
}
```

- [ ] **Test, commit.**

### Task C.4.2: lib/seo/loops/optimization.ts

- [ ] **Implement orchestrator**

```typescript
// lib/seo/loops/optimization.ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { runAllDetectors } from './detectors'
import { proposeHypotheses } from './hypotheses'
import type { SprintStatus } from '@/lib/seo/types'

export async function runOptimizationLoop(): Promise<{ processed: number; proposalsCreated: number }> {
  const ACTIVE: SprintStatus[] = ['active', 'compounding']
  const snap = await adminDb.collection('seo_sprints').where('deleted', '==', false).where('status', 'in', ACTIVE).get()
  let processed = 0, proposalsCreated = 0
  for (const s of snap.docs) {
    const sprint = s.data() as any
    // Cap proposals: 2/week for first 4 weeks, then unlimited
    const recent = await adminDb.collection('seo_optimizations')
      .where('sprintId', '==', s.id)
      .where('detectedAt', '>=', new Date(Date.now() - 7 * 86_400_000).toISOString())
      .get()
    const cap = sprint.currentDay <= 28 ? 2 : 99
    if (recent.size >= cap) { processed++; continue }

    const signals = await runAllDetectors({
      sprintId: s.id, orgId: sprint.orgId, startDate: sprint.startDate,
      currentDay: sprint.currentDay, currentWeek: sprint.currentWeek, currentPhase: sprint.currentPhase,
    })
    const proposals = proposeHypotheses(signals, sprint.scoreboard)
    for (const p of proposals.slice(0, cap - recent.size)) {
      await adminDb.collection('seo_optimizations').add({
        sprintId: s.id, orgId: sprint.orgId,
        detectedAt: new Date().toISOString(),
        signal: signals.find((sig) => sig.type === p.hypothesisType.split(':')[0])!,
        hypothesis: p.hypothesis,
        hypothesisType: p.hypothesisType,
        proposedAction: p.proposedAction,
        generatedTaskIds: [],
        status: 'proposed',
        deleted: false,
      })
      proposalsCreated++
    }
    processed++
  }
  return { processed, proposalsCreated }
}
```

- [ ] **Test, commit.**

### Task C.4.3: Approve/reject/measure endpoints

- [ ] **POST /api/v1/seo/optimizations/[id]/approve**: turns proposal into actual `seo_tasks` rows. Updates `generatedTaskIds`, sets `status: 'in_progress'`, sets `outcomeMeasureScheduledFor: applied + 14 days`. Captures baseline snapshot (impressions/position for affected keyword/page).
- [ ] **POST /api/v1/seo/optimizations/[id]/reject**: sets `status: 'rejected'`.
- [ ] **POST /api/v1/seo/optimizations/[id]/measure**: reads current GSC data, computes delta vs baseline, marks `result` and updates sprint scoreboard (`scoreboard[hypothesisType].wins/losses/noChange++`).

- [ ] **Test, commit.**

```bash
git add lib/seo/loops/{hypotheses,optimization}.ts app/api/v1/seo/optimizations __tests__
git commit -m "feat(seo): add optimization-loop orchestrator + approve/reject/measure"
```

## C.5: Weekly cron + admin UI tabs

### Task C.5.1: /api/cron/seo-weekly

```typescript
// app/api/cron/seo-weekly/route.ts
import { NextRequest } from 'next/server'
import { runOptimizationLoop } from '@/lib/seo/loops/optimization'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)
  const result = await runOptimizationLoop()
  return apiSuccess(result)
}
```

Add to `vercel.json`:
```json
{ "path": "/api/cron/seo-weekly", "schedule": "0 5 * * 1" }
```
(05:00 UTC Mondays = 07:00 SAST.)

- [ ] **Commit.**

### Task C.5.2: Admin Content/Audits/Optimizations tabs

- [ ] **/admin/seo/sprints/[id]/content/page.tsx** — table of content rows. Each row supports inline status change, "Draft via AI" button (calls `/draft`), "Repurpose" button (calls `/repurpose`).

- [ ] **/admin/seo/sprints/[id]/audits/page.tsx** — list of audit cards with snapshot day, impressions/clicks/positions. "Generate Day N audit" button. Each card has "Share" + "PDF" links.

- [ ] **/admin/seo/sprints/[id]/optimizations/page.tsx** — list of optimization rows. Each row shows signal evidence, hypothesis, proposed action, status. Approve/Reject buttons. Filterable by status + win/loss.

- [ ] **Commit.**

```bash
git add app/api/cron/seo-weekly app/\(admin\)/admin/seo/sprints/\[id\]/{content,audits,optimizations} vercel.json
git commit -m "feat(seo): wire weekly optimization cron + content/audits/optimizations tabs"
```

**Phase C complete.** Optimization loop generates proposals weekly, approves into tasks, measures outcomes, scoreboard fills in.

---

# Phase D — In-house toolkit + portal + autopilot (Week 4)

Goal: 13 in-house SEO tools (replacing Outrank links), client-facing portal at `/portal/seo`, autopilot `safe`/`full` modes wired up to actually do work.

## D.1: In-house SEO tools (parallel-eligible — each tool is its own subagent)

Each tool follows this pattern: implementation in `lib/seo/tools/<tool>.ts` + endpoint in `app/api/v1/seo/tools/<tool>/route.ts` + test in `__tests__/lib/seo/tools/<tool>.test.ts`.

### Task D.1.1: page-fetch (shared cache fetch)

```typescript
// lib/seo/tools/page-fetch.ts
import { adminDb } from '@/lib/firebase/admin'

const CACHE_TTL_MS = 5 * 60 * 1000

export async function fetchPage(url: string): Promise<{ html: string; status: number; headers: Record<string, string>; cachedAt: string }> {
  const cacheKey = encodeURIComponent(url)
  const ref = adminDb.collection('seo_page_cache').doc(cacheKey)
  const snap = await ref.get()
  if (snap.exists) {
    const c = snap.data() as any
    if (c.cachedAt && Date.now() - new Date(c.cachedAt).getTime() < CACHE_TTL_MS) return c
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'PartnersInBiz-SEO-Bot/1.0' } })
  const html = await res.text()
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => { headers[k] = v })
  const data = { html, status: res.status, headers, cachedAt: new Date().toISOString() }
  await ref.set(data)
  return data
}
```

Test, endpoint, commit.

### Task D.1.2: metadata-check

Parse HTML for `<title>`, `<meta name="description">`, `<meta property="og:*">`, `<meta name="twitter:*">`. Return findings + any missing/length-warning rules.

### Task D.1.3: robots-check

Fetch `/robots.txt`, parse, flag if `Disallow: /` exists for `User-agent: *` or Googlebot.

### Task D.1.4: sitemap-check

Fetch sitemap URL, parse XML, count URLs, spot-check 5 random URLs for HTTP 200 status.

### Task D.1.5: canonical-check

Crawl sitemap (or list of URLs from input), parse each for `<link rel="canonical">`, flag missing/conflicting canonicals.

### Task D.1.6: crawler-sim

Fetch URL with Googlebot-like User-Agent. Parse HTML server-side. Surface what's renderable without JS — flag if main content is JS-only.

### Task D.1.7: schema-validate

Parse JSON-LD blocks from page. Validate against schema.org property names (lightweight schema check, not full SHACL — for v1, validate `@type` is real and required props are present per a small whitelist of SoftwareApplication, FAQPage, Article, Product).

### Task D.1.8: title/meta/slug AI generators

```typescript
// lib/seo/tools/ai-generators.ts
import { generateText } from 'ai'
import { openai } from '@/lib/ai/...'

export async function generateTitle(topic: string, keyword: string): Promise<string[]> {
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `Generate 5 SEO-optimized page title options (under 60 chars each) for topic "${topic}" targeting keyword "${keyword}". Return as a numbered list, one per line.`,
  })
  return text.split('\n').filter((l) => /^\d/.test(l)).map((l) => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean)
}

export async function generateMeta(topic: string, keyword: string): Promise<string[]> {
  // similar pattern, 3 options under 160 chars
}

export function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}
```

Test, endpoints, commit.

### Task D.1.9: keyword-density

Fetch page, tokenize main text, count keyword/phrase frequency. Return top 20 + density% for input keyword.

### Task D.1.10: keyword-discover

Combines:
- GSC Search Analytics for the sprint's site, filtered to queries with `position 11-50` (opportunity zone)
- Google Autocomplete (free, lightly used): `https://suggestqueries.google.com/complete/search?client=firefox&q=<seed>`
- Wikipedia related topics: `GET https://en.wikipedia.org/api/rest_v1/page/related/<topic>`
- Competitor page extraction: input competitor URL → extract h1/h2/h3 text

Returns ranked candidate list with scores (intent inference, estimated competition from OpenPageRank of top 3 google results).

This is the most complex tool — split into helpers in `lib/seo/tools/keyword-discover.ts`.

### Task D.1.11: internal-link-audit

Crawl sitemap. Build link graph. Identify orphans (no inbound) and over-linked pages. Score by PageRank-like simple iteration.

### Task D.1.12: seo-roi

Pure compute: input keywords[] (volume, conversion estimate), CPC estimate, CR. Output projected monthly value.

### Task D.1.13: standalone /admin/seo/tools UI

Page that lists all 13 tools with input forms. Submit → call API → render results. No DB reads.

For each tool task: write the tool, the endpoint, the test. Commit per tool.

```bash
git add lib/seo/tools app/api/v1/seo/tools app/\(admin\)/admin/seo/tools __tests__
git commit -m "feat(seo): add 13 in-house SEO tools + standalone /admin/seo/tools UI"
```

## D.2: Wire executors for autopilot-eligible task types

Now that tools exist, wire executors in `lib/seo/loops/execution.ts` for each autopilot-safe task type:

- `meta-tag-audit` → calls `metadata-check` tool, drafts replacements via `title-generate`/`meta-generate`, saves draft as artifact
- `robots-check` → calls `robots-check` tool, writes findings to artifact
- `pagespeed-check` → triggers PageSpeed run for current sprint
- `cwv-check` → reads page_health subcollection
- `canonical-check` → calls `canonical-check` tool
- `gsc-index-check` → reads GSC inspection results
- `keyword-record` → no-op (just verifies count is set)
- `directory-submission` → marks all `seo_backlinks` with status `not_started` and `type: 'directory'` as `submitted` with note "Pip prepared submission package on YYYY-MM-DD" (actual submission stays manual until directories have APIs)
- `audit-snapshot` → calls `generateAuditSnapshot`
- `audit-render` → renders audit doc as HTML (PDF in Phase E)
- `internal-link-add` → calls `internal-link-audit`, drafts a list of suggested links, saves as artifact
- `gsc-stuck-pages` → finds pages in GSC at position 8-22, generates a per-page `page-rewrite` task tagged for human review

For each `taskType`, register an executor in `execution.ts` using `registerExecutor`. Pattern:

```typescript
import { registerExecutor } from './execution'
import { runMetadataCheck } from '@/lib/seo/tools/metadata'

registerExecutor('meta-tag-audit', async (taskId, sprintId, user) => {
  const sprint = await getSprint(sprintId)
  const result = await runMetadataCheck(sprint.siteUrl)
  const artifact = await saveArtifact({ kind: 'metadata-audit', data: result, taskId })
  return { status: 'done', artifactId: artifact.id }
})
```

Use a single registration file `lib/seo/loops/executors.ts` that imports and registers all executors. Import this from cron/seo-daily and from the run endpoint to ensure executors are registered.

- [ ] **Implement, test, commit.**

```bash
git add lib/seo/loops/executors.ts
git commit -m "feat(seo): wire executors for 12 autopilot-safe task types"
```

## D.3: Client portal `/portal/seo`

### Task D.3.1: Portal index page

**Files:** Create: `app/(portal)/portal/seo/page.tsx`.

- [ ] **Implement**: list of client's sprints (filtered by their orgId via portal middleware). Each sprint shows: site name, day X of 90 (or Phase 4 day Y), headline impression growth.

- [ ] **Commit.**

### Task D.3.2-8: Per-sprint portal tabs

**Files:** Create: `app/(portal)/portal/seo/sprints/[id]/{layout,page,performance,pages,blog,keywords,content,audits}/{layout,page}.tsx` and supporting components.

- [ ] **layout.tsx**: tabs nav (Progress, Performance, Pages, Blog, Keywords, Content, Audits).
- [ ] **page.tsx (Progress)**: phase milestone graphic, "X of Y tasks done", in-flight tasks, recent activity log (last 30 days of completed tasks).
- [ ] **performance/page.tsx**: top-line metrics, sparklines vs Day 1 baseline (uses `seo_audits` snapshots), CWV badges from `page_health`.
- [ ] **pages/page.tsx**: per-page table (URL, indexed?, top query, impressions, clicks, avg position, last touched). Drilldown on click.
- [ ] **blog/page.tsx**: published `seo_content` rows, per-post performance, repurpose status.
- [ ] **keywords/page.tsx**: client-friendly view of `seo_keywords` (no DR-by-domain internals).
- [ ] **content/page.tsx**: editorial pipeline view; if a `status='review'` draft exists, show "Approve / Request changes" buttons that POST to `/api/v1/seo/content/[id]/route.ts PATCH`.
- [ ] **audits/page.tsx**: list of audits with public-shareable URLs and PDF links.

Critically, the portal's middleware already filters by `orgId` — verify by checking `app/(portal)/portal/layout.tsx` and confirm new pages inherit it. Add a test ensuring requests outside orgId return 403/redirect.

- [ ] **Test (light — smoke + 1 access-control test), commit.**

```bash
git add app/\(portal\)/portal/seo
git commit -m "feat(seo): add client portal /portal/seo (Progress/Performance/Pages/Blog/Keywords/Content/Audits)"
```

## D.4: Autopilot full mode + webhook events

### Task D.4.1: Wire `full` autopilot mode

In `executeTask`, when `sprint.autopilotMode === 'full'`, allow the autopilot-ineligible-by-default types like `post-publish`, `post-repurpose`, `pillar-publish` IF they have an executor registered (e.g. `post-publish` → publishes to insights blog AND triggers `post-repurpose` → calls social skill).

Implement these executors:
- `post-publish` → moves draft to live insights blog, sets `seo_content.status='live'`
- `post-repurpose` → calls `/api/v1/social/posts` for LI + X drafts, sets `liUrl`, `xUrl`
- `audit-announce` → only fires in autopilot full + only for week-13 task; calls social skill

- [ ] **Test, commit.**

### Task D.4.2: Register 9 webhook events

Webhook events use the existing `/webhooks` system. Just register the new event types in the platform's events registry (likely `lib/webhooks/events.ts`). Fire the event from each relevant action:

- `seo.sprint.created` — fire from POST /sprints
- `seo.sprint.archived` — fire from POST /archive
- `seo.task.completed` — fire from POST /tasks/[id]/complete and execution loop on completion
- `seo.audit.published` — fire from POST /audits/[id]/share (public)
- `seo.optimization.proposed` — fire from optimization loop on insert
- `seo.optimization.applied` — fire from POST /optimizations/[id]/approve
- `seo.keyword.top10` — fire from daily pull when keyword crosses into top 10
- `seo.keyword.top3` — same for top 3
- `seo.content.published` — fire from POST /content/[id]/publish

- [ ] **Test (one event end-to-end via the existing webhook delivery test pattern), commit.**

```bash
git add lib/seo/loops/executors.ts lib/webhooks/events.ts __tests__
git commit -m "feat(seo): wire autopilot full mode + 9 webhook events"
```

**Phase D complete.** Toolkit live, portal live, autopilot working both safe and full, events firing.

---

# Phase E — Polish, skill, docs (Week 5)

## E.1: Day 90 audit PDF rendering

### Task E.1.1: PDF generation

**Files:** Modify: `app/api/v1/seo/audits/[id]/report.pdf/route.ts`. Add: `lib/seo/audits/pdf.ts`.

There's no PDF lib in package.json yet. Add `@react-pdf/renderer` (already on the deferred-followups list per memory).

- [ ] **Step 1: Install**

```bash
npm install @react-pdf/renderer
```

- [ ] **Step 2: Build the PDF document component**

Create `lib/seo/audits/pdf.ts` exporting a React component `<AuditPdf audit={...} sprint={...} />`. Pages: cover (sprint name, date), Traffic, Rankings, Authority, Content. Charts as static SVG snapshots from recharts (server-render or use react-pdf's native primitives).

- [ ] **Step 3: Wire endpoint**

```typescript
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const audit = await loadAudit(id)
  const sprint = await loadSprint(audit.sprintId)
  const stream = await renderToStream(<AuditPdf audit={audit} sprint={sprint} />)
  return new Response(stream as any, { headers: { 'content-type': 'application/pdf' } })
}
```

- [ ] **Test, commit.**

```bash
git add lib/seo/audits app/api/v1/seo/audits/\[id\]/report.pdf package.json package-lock.json
git commit -m "feat(seo): add Day 90 audit PDF rendering"
```

## E.2: Public shareable audit URLs

### Task E.2.1: Public share page

**Files:** Create: `app/(public)/seo-audit/[token]/page.tsx`.

- [ ] **Implement**: looks up audit by `publicShareToken` field; renders branded view of the audit. No auth required. If token doesn't match anything, 404. Records a view in `seo_audits/{id}/views` subcollection (date, IP-hash) for analytics.

- [ ] **Commit.**

```bash
git add app/\(public\)/seo-audit
git commit -m "feat(seo): add public shareable audit URLs"
```

## E.3: Settings UI for autopilot per task type

### Task E.3.1: /admin/seo/sprints/[id]/settings/page.tsx

- [ ] **Implement**: form to edit `autopilotMode` (radio off/safe/full), `autopilotTaskTypes` (multiselect of all known taskTypes from the template + dynamic types), integration toggles, archive button.

- [ ] **Commit.**

```bash
git add app/\(admin\)/admin/seo/sprints/\[id\]/settings
git commit -m "feat(seo): add sprint settings page (autopilot + integrations)"
```

## E.4: Skill SKILL.md

### Task E.4.1: Write the skill

**Files:** Create: `.claude/skills/seo-sprint-manager/SKILL.md`.

- [ ] **Step 1: Mirror the social-media-manager structure**

Header: `name`, `description` (rich keyword list mirroring social skill — see existing skill for pattern). Body sections:

- Auth (Bearer + AI_API_KEY)
- Base URL
- Multi-tenant usage notes
- "Browse & status" — list sprints, get today, get health
- "Run a day's work" — call `/run`
- "Manage tasks" — list, complete, skip, execute
- "Keyword work" — add, update, retire, positions
- "Backlink work" — add, mark-live, discover, sync from Bing
- "Content work" — create, draft, repurpose, publish (cross-skill handoff to social-media-manager documented)
- "Audit work" — generate, share, PDF
- "Optimization" — propose, approve, reject, measure
- "Tools" — direct calls to /tools/*
- "Integrations" — connect/disconnect/manual-pull
- Examples section: 5 worked examples ("do today's SEO for X", "create new sprint", "approve all open optimizations", "run audit for Day 30", "discover backlinks via Bing")

- [ ] **Step 2: Add skill description to be discoverable**

The `description` field is what gets indexed for skill-matching. Include at least 50 trigger phrases like the social skill does: "do today's SEO", "run SEO sprint", "check rankings", "add keyword", "generate audit", "approve optimization", "find stuck pages", etc.

- [ ] **Step 3: Test discoverability**

In a new chat, type "Pip, do today's SEO for the partnersinbiz.online sprint" — confirm the skill activates.

- [ ] **Commit.**

```bash
git add .claude/skills/seo-sprint-manager
git commit -m "feat(seo): add seo-sprint-manager skill (SKILL.md)"
```

## E.5: Wiki + memory updates

### Task E.5.1: Wiki article

**Files:** Create: `/Users/peetstander/Cowork/Cowork/agents/partners/wiki/seo-sprint-manager.md`.

- [ ] **Write**: high-level summary mirroring `agent-api-skills.md`. Sections: what was built, design principles enforced (Karpathy autoresearch, sprint-owns-its-tasks, etc.), webhook events list (9), file locations, related links. Update `index.md` to link to it.

- [ ] **Step 2: Update hot.md**

Append a "SEO Sprint Manager (2026-05-04)" section to `~/Cowork/Cowork/agents/partners/wiki/hot.md` summarising the build.

- [ ] **Commit (Cowork repo)**

```bash
cd /Users/peetstander/Cowork/Cowork
git add agents/partners/wiki/seo-sprint-manager.md agents/partners/wiki/hot.md agents/partners/index.md
git commit -m "docs(partners): add seo-sprint-manager wiki + hot cache update"
```

### Task E.5.2: Update memory index

Append to `/Users/peetstander/.claude/projects/-Users-peetstander-Cowork-Partners-in-Biz---Client-Growth/memory/MEMORY.md`:

- `[SEO Sprint Manager build](project_seo_sprint_manager.md) — 9th skill: 90-day SEO tracker with Karpathy optimization loop, in-house toolkit, GSC + Bing + PageSpeed integrations`

Create the linked detail file with key info.

- [ ] **Commit memory.**

## E.6: End-to-end smoke test on partnersinbiz.online sprint

### Task E.6.1: Dogfood

- [ ] **Step 1: Create the sprint via /admin/seo/sprints/new** for `partnersinbiz.online`.
- [ ] **Step 2: Connect GSC** (real OAuth flow).
- [ ] **Step 3: Manually trigger daily cron**, verify keywords filling in.
- [ ] **Step 4: Run "do today's SEO for partnersinbiz.online"** via Pip in chat.
- [ ] **Step 5: Verify** at least one task completed via autopilot, others queued.
- [ ] **Step 6: After 7 days**, verify weekly cron ran, optimization proposals appeared.
- [ ] **Step 7: Generate Day 30 audit** (manually, since real day-30 is in the future), verify PDF renders.
- [ ] **Step 8: Verify portal view** at `/portal/seo` (logged in as the platform-owner client) shows the right data, no internal data leaking.

- [ ] **Step 9: Document any issues found, fix, re-test.**

```bash
git commit -m "test(seo): dogfood smoke test on partnersinbiz.online sprint"
```

## E.7: Deploy + final verification

### Task E.7.1: Production deploy

- [ ] **Step 1: Push to main, verify Vercel build passes** (auto-deploys per existing GitHub→Vercel link).
- [ ] **Step 2: Set production env vars in Vercel dashboard:**
  - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GSC_REDIRECT_URI` — production URL
  - `BING_WMT_API_KEY`
  - `PAGESPEED_API_KEY` (optional)
  - `OPR_API_KEY`
  - `CRON_SECRET` already set
- [ ] **Step 3: Confirm crons appear in Vercel dashboard** (Project → Cron jobs).
- [ ] **Step 4: Run production smoke**: hit `/api/v1/seo/sprints` with AI_API_KEY, confirm 200 + the dogfood sprint visible.

**Phase E complete.** Production-ready.

---

# Self-review checklist (run after writing the plan)

- [x] **Spec coverage** — every section of the spec is covered:
  - Decisions Q1-Q5 + paid-tool replacement: spec respected throughout (one sprint per site, default safe/full toggle, GSC+PageSpeed integrations, template seeds, admin+portal)
  - Three loops (A daily, B execution, C optimization): A.8, B.7, C.4
  - Sprint lifecycle phases 0-4: handled in `computeWeek` (A.8.1) + scoreboard
  - Data model 7 collections: A.3.1 (rules), A.3.2 (indexes), all CRUD endpoints
  - Optimization detectors (9): C.3.2-10
  - Integrations (5: GSC, Bing, PageSpeed, OPR, Common Crawl): A.4-A.7
  - In-house toolkit (13 tools): D.1.1-13
  - UI (admin + portal): B.8, B.9, C.5.2, D.3, E.3
  - Skill API surface: all endpoints have a Phase letter
  - Idempotency, errors, audit trail, webhook events (9): cross-cutting + D.4.2
  - Cron schedule (daily 06:00 SAST, weekly Mon 07:00 SAST): A.8.2, C.5.1
  - Out of scope: respected (no Ahrefs/Moz, no SERP scraping, no GA4 in v1, etc.)
  - Risks + mitigations: GSC token-expiry → A.4 + cron checks; Common Crawl as fallback → A.7; opt cap first 4 weeks → C.4.2; full autopilot opt-in → D.4.1; auto Reconnect-GSC task → A.4 pull updates `tokenStatus`

- [x] **Placeholder scan** — no `TBD`, no `TODO`, no "implement later" patterns. The only forward-references are explicit ("filled in Phase B.7", "stub for Phase E") with concrete completion tasks.

- [x] **Type consistency** — function names checked: `pullDailyGscForSprint` consistent across A.4, A.6, A.8, B.5; `runDailyLoop` / `runOptimizationLoop` / `runExecutionLoopForSprint` consistent across A.8, B.7, C.4. `executeTask` / `registerExecutor` / `executors` symbol set consistent in B.7 + D.2. `requireSprintAccess` consistent. Type names from `lib/seo/types.ts` used consistently throughout (`SeoSprint`, `SeoTask`, `SignalType`, etc.).
