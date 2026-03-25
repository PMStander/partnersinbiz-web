# Phase 6 — Admin Dashboard + Marketing Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an aggregate stats dashboard for admins (contacts, pipeline value, email counts, active sequences) plus a marketing analytics page showing email performance metrics and lead source breakdown.

**Architecture:** Three new API routes under `/api/v1/dashboard/` serve aggregated Firestore data using parallel `Promise.all` queries. The admin dashboard UI replaces the existing direct-Firestore client page. A new `/admin/marketing` page visualises email funnel and lead source distribution.

**Tech Stack:** Next.js 16 App Router, Firebase Admin SDK (Firestore), TypeScript, Jest + ts-jest

---

### Task 1: Dashboard Stats API

**Files:**
- Create: `app/api/v1/dashboard/stats/route.ts`
- Create: `__tests__/api/dashboard-stats.test.ts`

Returns a single object with counts/sums across all major collections.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/dashboard-stats.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'
const authHeader = { Authorization: 'Bearer test-key' }

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/dashboard/stats', () => {
  it('returns aggregate stats', async () => {
    // contacts
    mockGet
      .mockResolvedValueOnce({ docs: [{ id: 'c1', data: () => ({}) }, { id: 'c2', data: () => ({}) }] })
      // deals
      .mockResolvedValueOnce({ docs: [
        { id: 'd1', data: () => ({ stage: 'proposal', value: 5000 }) },
        { id: 'd2', data: () => ({ stage: 'won', value: 10000 }) },
      ]})
      // emails sent
      .mockResolvedValueOnce({ docs: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] })
      // emails opened
      .mockResolvedValueOnce({ docs: [{ id: 'e1' }] })
      // active sequences
      .mockResolvedValueOnce({ docs: [{ id: 's1' }] })
      // active enrollments
      .mockResolvedValueOnce({ docs: [{ id: 'en1' }, { id: 'en2' }] })

    const { GET } = await import('@/app/api/v1/dashboard/stats/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/stats', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.contacts.total).toBe(2)
    expect(body.data.deals.pipelineValue).toBe(15000)
    expect(body.data.email.sent).toBe(3)
    expect(body.data.email.opened).toBe(1)
    expect(body.data.sequences.active).toBe(1)
    expect(body.data.sequences.activeEnrollments).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/dashboard-stats.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement the route**

```typescript
// app/api/v1/dashboard/stats/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (_req: NextRequest) => {
  const [
    contactsSnap,
    dealsSnap,
    emailSentSnap,
    emailOpenedSnap,
    activeSeqSnap,
    activeEnrollSnap,
  ] = await Promise.all([
    (adminDb.collection('contacts') as any).where('deleted', '!=', true).get(),
    (adminDb.collection('deals') as any).where('deleted', '!=', true).get(),
    (adminDb.collection('emails') as any).where('status', '==', 'sent').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'opened').get(),
    (adminDb.collection('sequences') as any).where('status', '==', 'active').get(),
    (adminDb.collection('sequence_enrollments') as any).where('status', '==', 'active').get(),
  ])

  const deals = dealsSnap.docs.map((d: any) => d.data())
  const pipelineValue = deals.reduce((sum: number, d: any) => sum + (d.value ?? 0), 0)
  const wonValue = deals
    .filter((d: any) => d.stage === 'won')
    .reduce((sum: number, d: any) => sum + (d.value ?? 0), 0)

  return apiSuccess({
    contacts: {
      total: contactsSnap.docs.length,
    },
    deals: {
      total: dealsSnap.docs.length,
      pipelineValue,
      wonValue,
    },
    email: {
      sent: emailSentSnap.docs.length,
      opened: emailOpenedSnap.docs.length,
    },
    sequences: {
      active: activeSeqSnap.docs.length,
      activeEnrollments: activeEnrollSnap.docs.length,
    },
  })
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/api/dashboard-stats.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 1 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/dashboard/stats/route.ts __tests__/api/dashboard-stats.test.ts
git commit -m "feat: add dashboard stats API with aggregate counts and pipeline value"
```

---

### Task 2: Activity Feed API

**Files:**
- Create: `app/api/v1/dashboard/activity/route.ts`
- Create: `__tests__/api/dashboard-activity.test.ts`

Returns the latest N activities across all contacts (not scoped to one contact).

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/dashboard-activity.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()
const mockWhere = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'
const authHeader = { Authorization: 'Bearer test-key' }

beforeEach(() => {
  jest.clearAllMocks()
  const query = { orderBy: mockOrderBy, limit: mockLimit, where: mockWhere, get: mockGet }
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockWhere.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/dashboard/activity', () => {
  it('returns recent activities', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'a1', data: () => ({ type: 'email_sent', contactId: 'c1', note: 'Sent intro', createdAt: null }) },
        { id: 'a2', data: () => ({ type: 'note', contactId: 'c2', note: 'Called', createdAt: null }) },
      ],
    })
    const { GET } = await import('@/app/api/v1/dashboard/activity/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/activity', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
  })

  it('respects limit query param', async () => {
    mockGet.mockResolvedValue({ docs: [] })
    const { GET } = await import('@/app/api/v1/dashboard/activity/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/activity?limit=5', { headers: authHeader })
    await GET(req)
    expect(mockLimit).toHaveBeenCalledWith(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/dashboard-activity.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement the route**

```typescript
// app/api/v1/dashboard/activity/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  const snap = await (adminDb.collection('activities') as any)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/dashboard-activity.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 2 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/dashboard/activity/route.ts __tests__/api/dashboard-activity.test.ts
git commit -m "feat: add dashboard activity feed API"
```

---

### Task 3: Email Stats API

**Files:**
- Create: `app/api/v1/dashboard/email-stats/route.ts`
- Create: `__tests__/api/dashboard-email-stats.test.ts`

Returns email funnel counts (sent/opened/clicked/failed) and contact source breakdown for the marketing tracker.

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/dashboard-email-stats.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'
const authHeader = { Authorization: 'Bearer test-key' }

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/dashboard/email-stats', () => {
  it('returns email funnel and contact sources', async () => {
    mockGet
      // sent
      .mockResolvedValueOnce({ docs: Array(10).fill({ id: 'e', data: () => ({}) }) })
      // opened
      .mockResolvedValueOnce({ docs: Array(4).fill({ id: 'e', data: () => ({}) }) })
      // clicked
      .mockResolvedValueOnce({ docs: Array(2).fill({ id: 'e', data: () => ({}) }) })
      // failed
      .mockResolvedValueOnce({ docs: Array(1).fill({ id: 'e', data: () => ({}) }) })
      // contacts for source breakdown
      .mockResolvedValueOnce({
        docs: [
          { id: 'c1', data: () => ({ source: 'website' }) },
          { id: 'c2', data: () => ({ source: 'referral' }) },
          { id: 'c3', data: () => ({ source: 'website' }) },
          { id: 'c4', data: () => ({ source: null }) },
        ],
      })

    const { GET } = await import('@/app/api/v1/dashboard/email-stats/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/email-stats', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.funnel.sent).toBe(10)
    expect(body.data.funnel.opened).toBe(4)
    expect(body.data.funnel.clicked).toBe(2)
    expect(body.data.funnel.failed).toBe(1)
    expect(body.data.funnel.openRate).toBe(40)
    expect(body.data.funnel.clickRate).toBe(20)
    expect(body.data.sources).toEqual(expect.arrayContaining([
      { source: 'website', count: 2 },
      { source: 'referral', count: 1 },
    ]))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/dashboard-email-stats.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement the route**

```typescript
// app/api/v1/dashboard/email-stats/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (_req: NextRequest) => {
  const [sentSnap, openedSnap, clickedSnap, failedSnap, contactsSnap] = await Promise.all([
    (adminDb.collection('emails') as any).where('status', '==', 'sent').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'opened').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'clicked').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'failed').get(),
    (adminDb.collection('contacts') as any).where('deleted', '!=', true).get(),
  ])

  const sent = sentSnap.docs.length
  const opened = openedSnap.docs.length
  const clicked = clickedSnap.docs.length
  const failed = failedSnap.docs.length

  // Source breakdown from contacts
  const sourceCounts: Record<string, number> = {}
  for (const doc of contactsSnap.docs) {
    const source: string = doc.data().source || 'unknown'
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1
  }
  const sources = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  return apiSuccess({
    funnel: {
      sent,
      opened,
      clicked,
      failed,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
    },
    sources,
  })
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/api/dashboard-email-stats.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 1 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/dashboard/email-stats/route.ts __tests__/api/dashboard-email-stats.test.ts
git commit -m "feat: add email stats API with funnel metrics and lead source breakdown"
```

---

### Task 4: Admin Dashboard UI

**Files:**
- Modify: `app/(admin)/admin/dashboard/page.tsx` — replace existing direct-Firestore page with stats-driven dashboard

- [ ] **Step 1: Replace the existing dashboard page**

```typescript
// app/(admin)/admin/dashboard/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Stats {
  contacts: { total: number }
  deals: { total: number; pipelineValue: number; wonValue: number }
  email: { sent: number; opened: number }
  sequences: { active: number; activeEnrollments: number }
}

interface Activity {
  id: string
  type: string
  contactId: string
  note: string
  createdAt: any
}

const ACTIVITY_ICONS: Record<string, string> = {
  email_sent: '✉️',
  note: '📝',
  stage_change: '🔄',
  sequence_enrolled: '📋',
  call: '📞',
}

function StatCard({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const content = (
    <div className="p-5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
      <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-on-surface">{value}</p>
      {sub && <p className="text-xs text-on-surface-variant mt-1">{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/dashboard/stats').then((r) => r.json()),
      fetch('/api/v1/dashboard/activity?limit=15').then((r) => r.json()),
    ]).then(([statsBody, activityBody]) => {
      setStats(statsBody.data)
      setActivity(activityBody.data ?? [])
      setLoading(false)
    })
  }, [])

  const openRate = stats && stats.email.sent > 0
    ? Math.round((stats.email.opened / stats.email.sent) * 100)
    : 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">Overview of your business</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Contacts"
              value={stats.contacts.total}
              href="/admin/crm/contacts"
            />
            <StatCard
              label="Pipeline Value"
              value={`$${stats.deals.pipelineValue.toLocaleString()}`}
              sub={`$${stats.deals.wonValue.toLocaleString()} won`}
              href="/admin/crm/pipeline"
            />
            <StatCard
              label="Emails Sent"
              value={stats.email.sent}
              sub={`${openRate}% open rate`}
              href="/admin/email"
            />
            <StatCard
              label="Active Sequences"
              value={stats.sequences.active}
              sub={`${stats.sequences.activeEnrollments} enrolled`}
              href="/admin/sequences"
            />
          </div>

          {/* Quick nav */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'CRM Contacts', href: '/admin/crm/contacts' },
              { label: 'Pipeline', href: '/admin/crm/pipeline' },
              { label: 'Email Inbox', href: '/admin/email' },
              { label: 'Sequences', href: '/admin/sequences' },
              { label: 'Compose Email', href: '/admin/email/compose' },
              { label: 'Marketing', href: '/admin/marketing' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-3 rounded-xl bg-surface-container text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors text-center"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Activity Feed */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Recent Activity</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="text-on-surface-variant text-sm text-center py-8">No activity yet.</p>
        ) : (
          <div className="space-y-1">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-container transition-colors">
                <span className="text-base flex-shrink-0">{ACTIVITY_ICONS[item.type] ?? '•'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface truncate">{item.note}</p>
                </div>
                <span className="text-xs text-on-surface-variant flex-shrink-0 capitalize">{item.type.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(admin)/admin/dashboard/page.tsx"
git commit -m "feat: replace admin dashboard with stats overview and activity feed"
```

---

### Task 5: Marketing Tracker UI

**Files:**
- Create: `app/(admin)/admin/marketing/page.tsx`

- [ ] **Step 1: Implement the marketing page**

```typescript
// app/(admin)/admin/marketing/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

interface EmailStats {
  funnel: {
    sent: number
    opened: number
    clicked: number
    failed: number
    openRate: number
    clickRate: number
  }
  sources: Array<{ source: string; count: number }>
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-on-surface-variant capitalize">{label}</span>
        <span className="text-on-surface font-medium">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-container overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function MarketingPage() {
  const [stats, setStats] = useState<EmailStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/dashboard/email-stats')
      .then((r) => r.json())
      .then((b) => { setStats(b.data); setLoading(false) })
  }, [])

  const maxFunnelValue = stats?.funnel.sent ?? 1

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Marketing</h1>
        <p className="text-sm text-on-surface-variant mt-1">Email performance and lead source analytics</p>
      </div>

      {/* Email Funnel */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-4">Email Funnel</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-8 rounded-xl bg-surface-container animate-pulse" />)}
          </div>
        ) : stats ? (
          <div className="rounded-xl bg-surface-container p-6 space-y-5">
            <FunnelBar label="sent" value={stats.funnel.sent} max={maxFunnelValue} color="bg-blue-400" />
            <FunnelBar label="opened" value={stats.funnel.opened} max={maxFunnelValue} color="bg-green-400" />
            <FunnelBar label="clicked" value={stats.funnel.clicked} max={maxFunnelValue} color="bg-purple-400" />
            <FunnelBar label="failed" value={stats.funnel.failed} max={maxFunnelValue} color="bg-red-400" />

            <div className="pt-3 border-t border-outline-variant flex gap-6">
              <div>
                <p className="text-2xl font-bold text-on-surface">{stats.funnel.openRate}%</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Open rate</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-on-surface">{stats.funnel.clickRate}%</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Click rate</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Lead Sources */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-4">Lead Sources</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-surface-container animate-pulse" />)}
          </div>
        ) : stats && stats.sources.length === 0 ? (
          <p className="text-on-surface-variant text-sm text-center py-8">No contacts yet.</p>
        ) : stats ? (
          <div className="rounded-xl bg-surface-container overflow-hidden">
            {stats.sources.filter((s) => s.source !== 'unknown').map((s, i) => {
              const maxCount = stats.sources[0]?.count ?? 1
              const pct = (s.count / maxCount) * 100
              return (
                <div key={s.source} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-outline-variant' : ''}`}>
                  <span className="text-sm font-medium text-on-surface w-28 capitalize">{s.source}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm text-on-surface-variant w-8 text-right">{s.count}</span>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(admin)/admin/marketing/page.tsx"
git commit -m "feat: add marketing tracker page with email funnel and lead sources"
```

---

### Task 6: Full Test Suite + Build Check

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```
Expected: All suites passing

- [ ] **Step 2: Run production build**

```bash
npx next build 2>&1 | tail -30
```
Expected: ✓ compiled successfully, includes `/admin/marketing`

- [ ] **Step 3: Commit fixes if needed**

```bash
git add -A && git commit -m "fix: resolve Phase 6 test or build issues"
```
