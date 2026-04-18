# Analytics MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Analytics MVP — event ingestion, session tracking, funnel analysis, browser SDK, and admin UI (Events, Sessions, Funnels pages).

**Architecture:** Events are ingested via a public POST endpoint authenticated with property-scoped ingest keys (from the already-shipped Properties module). Events write to `product_events`, sessions upsert to `product_sessions`, funnel definitions live in `product_funnels`. A ~5KB browser SDK handles batching and auto-capture. Admin UI reuses the existing PiB design system (pib-card, pib-input, pib-btn-primary, etc.).

**Branch:** `feat/analytics-mvp` (already created).

**Tech Stack:** Next.js 15 App Router · Firebase Admin SDK · TypeScript · Tailwind · Jest + ts-jest

**Critical patterns:**
- Admin routes: `withAuth('admin', async (req, user, ctx) => {})`
- Response helpers: `apiSuccess(data, status?)` / `apiError(message, status)` from `@/lib/api/response`
- Async route params: `type RouteContext = { params: Promise<{ id: string }> }` + `const { id } = await (ctx as RouteContext).params`
- Timestamps: `FieldValue.serverTimestamp()` from `firebase-admin/firestore`
- Actor: `actorFrom(user)` for creates from `@/lib/api/actor`
- Rate limiting: identical to `lib/forms/ratelimit.ts` — Firestore transaction on minute-bucket doc
- Ingest auth: property lookup by ID + validate `property.ingestKey === header`
- IP from request: `req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/analytics/types.ts` | Create | All shared types + constants |
| `lib/analytics/ip-hash.ts` | Create | Salted SHA-256 IP hashing |
| `lib/analytics/device.ts` | Create | UA string → DeviceType |
| `lib/analytics/ingest-rate-limit.ts` | Create | Per-ingest-key 100 req/min limiter |
| `app/api/v1/analytics/ingest/route.ts` | Create | POST public ingest — batch 50 events + session upsert |
| `app/api/v1/analytics/events/route.ts` | Create | GET events list |
| `app/api/v1/analytics/events/count/route.ts` | Create | GET event counts grouped |
| `app/api/v1/analytics/sessions/route.ts` | Create | GET sessions list |
| `app/api/v1/analytics/sessions/[id]/route.ts` | Create | GET session detail + events |
| `app/api/v1/analytics/funnels/route.ts` | Create | GET list + POST create |
| `app/api/v1/analytics/funnels/[id]/route.ts` | Create | GET + PUT + DELETE |
| `app/api/v1/analytics/funnels/[id]/results/route.ts` | Create | GET computed funnel conversion results |
| `packages/analytics-js/package.json` | Create | SDK package metadata |
| `packages/analytics-js/src/index.ts` | Create | Browser SDK: init/track/identify/page |
| `package.json` | Modify | Add `@partnersinbiz/analytics-js` file dep |
| `next.config.ts` | Modify | Add `transpilePackages` |
| `components/admin/AdminSidebar.tsx` | Modify | Add Analytics nav entry |
| `app/(admin)/admin/analytics/page.tsx` | Create | Redirect → /admin/analytics/events |
| `app/(admin)/admin/analytics/events/page.tsx` | Create | Events table with property/date filters |
| `app/(admin)/admin/analytics/sessions/page.tsx` | Create | Sessions list |
| `app/(admin)/admin/analytics/sessions/[id]/page.tsx` | Create | Session detail + event timeline |
| `app/(admin)/admin/analytics/funnels/page.tsx` | Create | Funnel list + builder |
| `firestore.indexes.json` | Modify | Analytics composite indexes |
| `firestore.rules` | Modify | Analytics collection rules |

---

## Task 1: TypeScript Types

**Files:**
- Create: `lib/analytics/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// lib/analytics/types.ts

export type DeviceType = 'mobile' | 'tablet' | 'desktop'
export type FunnelWindow = 'session' | '1h' | '24h' | '7d' | '30d'

export const VALID_FUNNEL_WINDOWS: FunnelWindow[] = ['session', '1h', '24h', '7d', '30d']

export const WINDOW_MS: Record<Exclude<FunnelWindow, 'session'>, number> = {
  '1h':  1 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export interface AnalyticsEvent {
  id: string
  orgId: string
  propertyId: string
  sessionId: string
  distinctId: string
  userId: string | null
  event: string
  properties: Record<string, unknown>
  pageUrl: string | null
  referrer: string | null
  userAgent: string | null
  ipHash: string | null
  country: string | null
  device: DeviceType | null
  timestamp: unknown  // Firestore Timestamp — serialised as { _seconds, _nanoseconds }
  serverTime: unknown
}

export interface AnalyticsSession {
  id: string
  orgId: string
  propertyId: string
  distinctId: string
  userId: string | null
  startedAt: unknown
  lastActivityAt: unknown
  endedAt: unknown | null
  eventCount: number
  pageCount: number
  referrer: string | null
  landingUrl: string | null
  country: string | null
  device: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  convertedEvents: string[]
}

export interface FunnelStep {
  event: string
  filters?: Record<string, unknown>
}

export interface AnalyticsFunnel {
  id: string
  orgId: string
  propertyId: string
  name: string
  steps: FunnelStep[]
  window: FunnelWindow
  createdBy: string
  createdAt: unknown
  updatedAt: unknown
}

export interface FunnelStepResult {
  event: string
  count: number
  conversionFromPrev: number | null
}

export interface FunnelResults {
  steps: FunnelStepResult[]
  totalEntered: number
  totalConverted: number
}

export interface IngestEventInput {
  event: string
  distinctId: string
  sessionId: string
  userId?: string | null
  properties?: Record<string, unknown>
  timestamp?: string
  pageUrl?: string | null
  referrer?: string | null
  userAgent?: string | null
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
  }
}

export interface IngestBody {
  propertyId: string
  events: IngestEventInput[]
}

export interface IngestResult {
  accepted: number
  rejected: number
  errors: string[]
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/analytics/types.ts
git commit -m "feat(analytics): add TypeScript types"
```

---

## Task 2: IP Hash + Device Utilities + Tests

**Files:**
- Create: `lib/analytics/ip-hash.ts`
- Create: `lib/analytics/device.ts`
- Create: `__tests__/lib/analytics/ip-hash.test.ts`
- Create: `__tests__/lib/analytics/device.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/analytics/ip-hash.test.ts
import { hashIp } from '@/lib/analytics/ip-hash'

describe('hashIp', () => {
  it('returns a 64-char hex string', () => {
    const result = hashIp('192.168.1.1')
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns same hash for same IP', () => {
    expect(hashIp('10.0.0.1')).toBe(hashIp('10.0.0.1'))
  })

  it('returns different hashes for different IPs', () => {
    expect(hashIp('1.1.1.1')).not.toBe(hashIp('2.2.2.2'))
  })

  it('handles unknown gracefully', () => {
    expect(hashIp('unknown')).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

```typescript
// __tests__/lib/analytics/device.test.ts
import { detectDevice } from '@/lib/analytics/device'

describe('detectDevice', () => {
  it('returns mobile for iPhone UA', () => {
    expect(detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile')
  })

  it('returns mobile for Android phone UA', () => {
    expect(detectDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')).toBe('mobile')
  })

  it('returns tablet for iPad UA', () => {
    expect(detectDevice('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet')
  })

  it('returns desktop for Chrome on macOS', () => {
    expect(detectDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120')).toBe('desktop')
  })

  it('returns null for null input', () => {
    expect(detectDevice(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/lib/analytics/ip-hash.test.ts __tests__/lib/analytics/device.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/analytics/ip-hash'`

- [ ] **Step 3: Implement utilities**

```typescript
// lib/analytics/ip-hash.ts
import { createHash } from 'node:crypto'

const SALT = process.env.ANALYTICS_IP_SALT ?? 'pib-analytics-default-salt'

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${SALT}:${ip}`).digest('hex')
}
```

```typescript
// lib/analytics/device.ts
import type { DeviceType } from './types'

export function detectDevice(ua: string | null): DeviceType | null {
  if (!ua) return null
  if (/iPad/i.test(ua)) return 'tablet'
  if (/mobile|android|iphone/i.test(ua)) return 'mobile'
  return 'desktop'
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/analytics/ip-hash.test.ts __tests__/lib/analytics/device.test.ts --no-coverage
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/ip-hash.ts lib/analytics/device.ts __tests__/lib/analytics/ip-hash.test.ts __tests__/lib/analytics/device.test.ts
git commit -m "feat(analytics): add IP hash and device detection utilities"
```

---

## Task 3: Ingest Rate Limiter + Tests

**Files:**
- Create: `lib/analytics/ingest-rate-limit.ts`
- Create: `__tests__/lib/analytics/ingest-rate-limit.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/lib/analytics/ingest-rate-limit.test.ts
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { runTransaction: jest.fn(), collection: jest.fn() },
}))

import { checkIngestRateLimit } from '@/lib/analytics/ingest-rate-limit'
import { adminDb } from '@/lib/firebase/admin'

describe('checkIngestRateLimit', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns true when under limit', async () => {
    ;(adminDb.runTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ count: 5 }) }),
        update: jest.fn(),
        set: jest.fn(),
      })
    })
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(true)
  })

  it('returns false when at limit (100)', async () => {
    ;(adminDb.runTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ count: 100 }) }),
        update: jest.fn(),
        set: jest.fn(),
      })
    })
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(false)
  })

  it('returns true when doc does not exist (first request)', async () => {
    ;(adminDb.runTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
        update: jest.fn(),
        set: jest.fn(),
      })
    })
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(true)
  })

  it('fails open when Firestore throws', async () => {
    ;(adminDb.runTransaction as jest.Mock).mockRejectedValue(new Error('Firestore down'))
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx jest __tests__/lib/analytics/ingest-rate-limit.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/analytics/ingest-rate-limit'`

- [ ] **Step 3: Implement**

```typescript
// lib/analytics/ingest-rate-limit.ts
// Per-ingest-key rate limiter: 100 requests/minute.
// Key shape: analytics_rate_limits/{ingestKey}_{minuteBucket}
// Reuses the same Firestore transaction pattern as lib/forms/ratelimit.ts.

import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'

const COLLECTION = 'analytics_rate_limits'
const LIMIT = 100
const BUCKET_TTL_MS = 60 * 60 * 1000  // 1h

export async function checkIngestRateLimit(ingestKey: string): Promise<boolean> {
  const minuteBucket = Math.floor(Date.now() / 60_000)
  const safeKey = ingestKey.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 64)
  const docId = `${safeKey}_${minuteBucket}`
  const ref = adminDb.collection(COLLECTION).doc(docId)

  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const current = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0
      if (current >= LIMIT) return false

      if (snap.exists) {
        tx.update(ref, { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
      } else {
        tx.set(ref, {
          ingestKey: safeKey,
          minuteBucket,
          count: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + BUCKET_TTL_MS),
        })
      }
      return true
    })
  } catch {
    return true  // fail open
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest __tests__/lib/analytics/ingest-rate-limit.test.ts --no-coverage
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/ingest-rate-limit.ts __tests__/lib/analytics/ingest-rate-limit.test.ts
git commit -m "feat(analytics): add ingest rate limiter (100 req/min per key)"
```

---

## Task 4: Ingest Endpoint + Tests

**Files:**
- Create: `app/api/v1/analytics/ingest/route.ts`
- Create: `__tests__/api/v1/analytics/ingest.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/v1/analytics/ingest.test.ts
jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: {
    collection: jest.fn(),
    batch: jest.fn(),
    runTransaction: jest.fn(),
  },
}))
jest.mock('@/lib/analytics/ingest-rate-limit', () => ({
  checkIngestRateLimit: jest.fn().mockResolvedValue(true),
}))

import { POST } from '@/app/api/v1/analytics/ingest/route'
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { checkIngestRateLimit } from '@/lib/analytics/ingest-rate-limit'

process.env.AI_API_KEY = 'test-key'

const VALID_PROPERTY = {
  id: 'prop-1',
  orgId: 'org-lumen',
  ingestKey: 'a'.repeat(64),
  status: 'active',
  deleted: false,
}

function makeReq(body: object, ingestKey = 'a'.repeat(64)) {
  return new NextRequest('http://localhost/api/v1/analytics/ingest', {
    method: 'POST',
    headers: { 'x-pib-ingest-key': ingestKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockPropertyLookup(property: object | null) {
  const batchMock = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
  ;(adminDb.batch as jest.Mock).mockReturnValue(batchMock)
  ;(adminDb.runTransaction as jest.Mock).mockResolvedValue(undefined)
  ;(adminDb.collection as jest.Mock).mockImplementation((col: string) => {
    if (col === 'properties') {
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            property
              ? { exists: true, data: () => property, id: (property as any).id }
              : { exists: false, data: () => null }
          ),
        }),
      }
    }
    return {
      doc: jest.fn().mockReturnValue({ set: jest.fn(), get: jest.fn() }),
      add: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    }
  })
}

const validEvent = {
  event: 'test_started',
  distinctId: 'anon_abc',
  sessionId: 'sess_xyz',
  properties: { passageId: 'focus' },
  timestamp: '2026-04-17T10:00:00.000Z',
}

describe('POST /api/v1/analytics/ingest', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when x-pib-ingest-key header is missing', async () => {
    const req = new NextRequest('http://localhost/api/v1/analytics/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ propertyId: 'prop-1', events: [validEvent] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when property not found', async () => {
    mockPropertyLookup(null)
    const res = await POST(makeReq({ propertyId: 'bad-id', events: [validEvent] }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when ingest key does not match property', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [validEvent] }, 'b'.repeat(64)))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    ;(checkIngestRateLimit as jest.Mock).mockResolvedValueOnce(false)
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [validEvent] }))
    expect(res.status).toBe(429)
  })

  it('accepts valid batch and returns accepted count', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [validEvent] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(1)
    expect(body.rejected).toBe(0)
  })

  it('rejects events missing required fields', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const badEvent = { event: '', distinctId: '', sessionId: '' }
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [badEvent] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rejected).toBeGreaterThan(0)
  })

  it('rejects batches over 50 events with 400', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const events = Array(51).fill(validEvent)
    const res = await POST(makeReq({ propertyId: 'prop-1', events }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx jest __tests__/api/v1/analytics/ingest.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/api/v1/analytics/ingest/route'`

- [ ] **Step 3: Implement ingest endpoint**

```typescript
// app/api/v1/analytics/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { checkIngestRateLimit } from '@/lib/analytics/ingest-rate-limit'
import { hashIp } from '@/lib/analytics/ip-hash'
import { detectDevice } from '@/lib/analytics/device'
import type { IngestBody, IngestEventInput, DeviceType } from '@/lib/analytics/types'

export const dynamic = 'force-dynamic'

const MAX_BATCH = 50

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

function validateEvent(e: IngestEventInput): string | null {
  if (!e.event || typeof e.event !== 'string') return 'event is required'
  if (!e.distinctId || typeof e.distinctId !== 'string') return 'distinctId is required'
  if (!e.sessionId || typeof e.sessionId !== 'string') return 'sessionId is required'
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ingestKey = req.headers.get('x-pib-ingest-key')
  if (!ingestKey) {
    return NextResponse.json({ error: 'x-pib-ingest-key header required' }, { status: 401 })
  }

  let body: IngestBody
  try {
    body = (await req.json()) as IngestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  }

  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: 'events must be an array' }, { status: 400 })
  }

  if (body.events.length > MAX_BATCH) {
    return NextResponse.json({ error: `Batch limit is ${MAX_BATCH} events` }, { status: 400 })
  }

  // Validate ingest key against property
  const propSnap = await adminDb.collection('properties').doc(body.propertyId).get().catch(() => null)
  if (!propSnap?.exists || propSnap.data()?.deleted) {
    return NextResponse.json({ error: 'Invalid ingest key' }, { status: 401 })
  }
  const property = propSnap.data()!
  if (property.ingestKey !== ingestKey) {
    return NextResponse.json({ error: 'Invalid ingest key' }, { status: 401 })
  }

  const allowed = await checkIngestRateLimit(ingestKey)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  const ip = getIp(req)
  const ipHash = hashIp(ip)
  const serverTime = FieldValue.serverTimestamp()
  const orgId: string = property.orgId
  const propertyId: string = body.propertyId
  const country = req.headers.get('x-vercel-ip-country') ?? null

  const accepted: IngestEventInput[] = []
  const errors: string[] = []

  for (const e of body.events) {
    const err = validateEvent(e)
    if (err) { errors.push(err); continue }
    accepted.push(e)
  }

  if (accepted.length > 0) {
    const batch = adminDb.batch()

    for (const e of accepted) {
      const ref = adminDb.collection('product_events').doc()
      const device: DeviceType | null = detectDevice(e.userAgent ?? req.headers.get('user-agent'))
      batch.set(ref, {
        orgId,
        propertyId,
        sessionId: e.sessionId,
        distinctId: e.distinctId,
        userId: e.userId ?? null,
        event: e.event,
        properties: e.properties ?? {},
        pageUrl: e.pageUrl ?? null,
        referrer: e.referrer ?? null,
        userAgent: e.userAgent ?? null,
        ipHash,
        country,
        device,
        timestamp: e.timestamp ? Timestamp.fromDate(new Date(e.timestamp)) : serverTime,
        serverTime,
      })
    }

    await batch.commit()

    // Upsert sessions — one transaction per unique sessionId
    const sessionGroups = new Map<string, { first: IngestEventInput; count: number; pageCount: number }>()
    for (const e of accepted) {
      const g = sessionGroups.get(e.sessionId)
      if (!g) {
        sessionGroups.set(e.sessionId, { first: e, count: 1, pageCount: e.pageUrl ? 1 : 0 })
      } else {
        g.count++
        if (e.pageUrl) g.pageCount++
      }
    }

    for (const [sessionId, g] of sessionGroups.entries()) {
      const sessionRef = adminDb.collection('product_sessions').doc(sessionId)
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef)
        if (snap.exists) {
          tx.update(sessionRef, {
            lastActivityAt: serverTime,
            eventCount: FieldValue.increment(g.count),
            pageCount: FieldValue.increment(g.pageCount),
            ...(g.first.userId && !snap.data()?.userId ? { userId: g.first.userId } : {}),
          })
        } else {
          const device: DeviceType | null = detectDevice(g.first.userAgent ?? null)
          tx.set(sessionRef, {
            orgId,
            propertyId,
            distinctId: g.first.distinctId,
            userId: g.first.userId ?? null,
            startedAt: serverTime,
            lastActivityAt: serverTime,
            endedAt: null,
            eventCount: g.count,
            pageCount: g.pageCount,
            referrer: g.first.referrer ?? null,
            landingUrl: g.first.pageUrl ?? null,
            country,
            device,
            utmSource: g.first.utm?.source ?? null,
            utmMedium: g.first.utm?.medium ?? null,
            utmCampaign: g.first.utm?.campaign ?? null,
            utmContent: g.first.utm?.content ?? null,
            convertedEvents: [],
          })
        }
      })
    }
  }

  return NextResponse.json({
    accepted: accepted.length,
    rejected: errors.length,
    errors,
  })
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest __tests__/api/v1/analytics/ingest.test.ts --no-coverage
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/analytics/ingest/route.ts __tests__/api/v1/analytics/ingest.test.ts
git commit -m "feat(analytics): POST /api/v1/analytics/ingest — batch ingest + session upsert"
```

---

## Task 5: Events Query Endpoints + Tests

**Files:**
- Create: `app/api/v1/analytics/events/route.ts`
- Create: `app/api/v1/analytics/events/count/route.ts`
- Create: `__tests__/api/v1/analytics/events.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/v1/analytics/events.test.ts
jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { GET } from '@/app/api/v1/analytics/events/route'
import { GET as COUNT } from '@/app/api/v1/analytics/events/count/route'
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'

process.env.AI_API_KEY = 'test-key'

function makeReq(search: string) {
  return new NextRequest(`http://localhost/api/v1/analytics/events${search}`, {
    headers: { authorization: 'Bearer test-key' },
  })
}

function mockEvents(docs: object[]) {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'evt-1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
  })
}

describe('GET /api/v1/analytics/events', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without auth', async () => {
    const res = await GET(new NextRequest('http://localhost/api/v1/analytics/events'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when propertyId missing', async () => {
    mockEvents([])
    const res = await GET(makeReq(''))
    expect(res.status).toBe(400)
  })

  it('returns events list', async () => {
    mockEvents([{ id: 'e1', event: 'test_started', distinctId: 'anon_1' }])
    const res = await GET(makeReq('?propertyId=prop-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe('GET /api/v1/analytics/events/count', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when propertyId missing', async () => {
    mockEvents([])
    const res = await COUNT(new NextRequest('http://localhost/api/v1/analytics/events/count', {
      headers: { authorization: 'Bearer test-key' },
    }))
    expect(res.status).toBe(400)
  })

  it('returns grouped counts', async () => {
    mockEvents([
      { event: 'test_started' },
      { event: 'test_started' },
      { event: 'share_clicked' },
    ])
    const res = await COUNT(makeReq('?propertyId=prop-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.groups).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx jest __tests__/api/v1/analytics/events.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/api/v1/analytics/events/route'`

- [ ] **Step 3: Implement events list endpoint**

```typescript
// app/api/v1/analytics/events/route.ts
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  if (!propertyId) return apiError('propertyId is required', 400)

  const event = searchParams.get('event')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const distinctId = searchParams.get('distinctId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  try {
    let q = adminDb.collection('product_events')
      .where('propertyId', '==', propertyId) as FirebaseFirestore.Query

    if (event) q = q.where('event', '==', event)
    if (distinctId) q = q.where('distinctId', '==', distinctId)
    if (from) q = q.where('serverTime', '>=', Timestamp.fromDate(new Date(from)))
    if (to) q = q.where('serverTime', '<=', Timestamp.fromDate(new Date(to)))

    q = q.orderBy('serverTime', 'desc').limit(limit)

    const snap = await q.get()
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return apiSuccess(data)
  } catch (e) {
    console.error('[analytics-events-get]', e)
    return apiError('Failed to query events', 500)
  }
})
```

- [ ] **Step 4: Implement events count endpoint**

```typescript
// app/api/v1/analytics/events/count/route.ts
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  if (!propertyId) return apiError('propertyId is required', 400)

  const from = searchParams.get('from')
  const to = searchParams.get('to')

  try {
    let q = adminDb.collection('product_events')
      .where('propertyId', '==', propertyId) as FirebaseFirestore.Query

    if (from) q = q.where('serverTime', '>=', Timestamp.fromDate(new Date(from)))
    if (to) q = q.where('serverTime', '<=', Timestamp.fromDate(new Date(to)))

    q = q.orderBy('serverTime', 'desc').limit(5000)

    const snap = await q.get()
    const counts = new Map<string, number>()
    for (const doc of snap.docs) {
      const ev = doc.data().event as string
      counts.set(ev, (counts.get(ev) ?? 0) + 1)
    }

    const groups = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }))

    return apiSuccess({ groups, total: snap.docs.length })
  } catch (e) {
    console.error('[analytics-events-count]', e)
    return apiError('Failed to count events', 500)
  }
})
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx jest __tests__/api/v1/analytics/events.test.ts --no-coverage
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/analytics/events/ __tests__/api/v1/analytics/events.test.ts
git commit -m "feat(analytics): events list + count query endpoints"
```

---

## Task 6: Sessions Endpoints + Tests

**Files:**
- Create: `app/api/v1/analytics/sessions/route.ts`
- Create: `app/api/v1/analytics/sessions/[id]/route.ts`
- Create: `__tests__/api/v1/analytics/sessions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/v1/analytics/sessions.test.ts
jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { GET } from '@/app/api/v1/analytics/sessions/route'
import { GET as GET_DETAIL } from '@/app/api/v1/analytics/sessions/[id]/route'
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'

process.env.AI_API_KEY = 'test-key'

function makeReq(url: string) {
  return new NextRequest(url, { headers: { authorization: 'Bearer test-key' } })
}

function mockCollection(col: string, docs: object[]) {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'sess-1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockImplementation((c: string) => {
    if (c === col) return {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: mockDocs }),
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(docs[0]
          ? { exists: true, id: (docs[0] as any).id ?? 'sess-1', data: () => docs[0] }
          : { exists: false, data: () => null }),
      }),
    }
    return {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    }
  })
}

describe('GET /api/v1/analytics/sessions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without auth', async () => {
    const res = await GET(new NextRequest('http://localhost/api/v1/analytics/sessions'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when propertyId missing', async () => {
    mockCollection('product_sessions', [])
    const res = await GET(makeReq('http://localhost/api/v1/analytics/sessions'))
    expect(res.status).toBe(400)
  })

  it('returns sessions list', async () => {
    mockCollection('product_sessions', [{ id: 's1', distinctId: 'anon_1', eventCount: 5 }])
    const res = await GET(makeReq('http://localhost/api/v1/analytics/sessions?propertyId=prop-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

describe('GET /api/v1/analytics/sessions/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns session with events', async () => {
    mockCollection('product_sessions', [{ id: 'sess-1', distinctId: 'anon_1' }])
    const ctx = { params: Promise.resolve({ id: 'sess-1' }) }
    const res = await GET_DETAIL(
      makeReq('http://localhost/api/v1/analytics/sessions/sess-1'),
      ctx,
    )
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx jest __tests__/api/v1/analytics/sessions.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/api/v1/analytics/sessions/route'`

- [ ] **Step 3: Implement sessions list endpoint**

```typescript
// app/api/v1/analytics/sessions/route.ts
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  if (!propertyId) return apiError('propertyId is required', 400)

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  try {
    let q = adminDb.collection('product_sessions')
      .where('propertyId', '==', propertyId) as FirebaseFirestore.Query

    if (from) q = q.where('startedAt', '>=', Timestamp.fromDate(new Date(from)))
    if (to) q = q.where('startedAt', '<=', Timestamp.fromDate(new Date(to)))

    q = q.orderBy('startedAt', 'desc').limit(limit)

    const snap = await q.get()
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return apiSuccess(data)
  } catch (e) {
    console.error('[analytics-sessions-get]', e)
    return apiError('Failed to query sessions', 500)
  }
})
```

- [ ] **Step 4: Implement session detail endpoint**

```typescript
// app/api/v1/analytics/sessions/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser, ctx: unknown) => {
  const { id } = await (ctx as RouteContext).params

  try {
    const sessionSnap = await adminDb.collection('product_sessions').doc(id).get()
    if (!sessionSnap.exists) return apiError('Session not found', 404)

    const eventsSnap = await adminDb.collection('product_events')
      .where('sessionId', '==', id)
      .orderBy('serverTime', 'asc')
      .limit(1000)
      .get()

    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    return apiSuccess({ session: { id: sessionSnap.id, ...sessionSnap.data() }, events })
  } catch (e) {
    console.error('[analytics-session-detail]', e)
    return apiError('Failed to fetch session', 500)
  }
})
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx jest __tests__/api/v1/analytics/sessions.test.ts --no-coverage
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/analytics/sessions/ __tests__/api/v1/analytics/sessions.test.ts
git commit -m "feat(analytics): sessions list + detail endpoints"
```

---

## Task 7: Funnels Endpoints + Tests

**Files:**
- Create: `app/api/v1/analytics/funnels/route.ts`
- Create: `app/api/v1/analytics/funnels/[id]/route.ts`
- Create: `app/api/v1/analytics/funnels/[id]/results/route.ts`
- Create: `lib/analytics/funnel-compute.ts`
- Create: `__tests__/api/v1/analytics/funnels.test.ts`
- Create: `__tests__/lib/analytics/funnel-compute.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/analytics/funnel-compute.test.ts
import { computeFunnelResults } from '@/lib/analytics/funnel-compute'
import type { FunnelStep } from '@/lib/analytics/types'

const steps: FunnelStep[] = [
  { event: 'page_view' },
  { event: 'test_started' },
  { event: 'share_clicked' },
]

// Helper: make fake events sorted by timestamp
function makeEvent(event: string, distinctId: string, sessionId: string, offsetMs = 0) {
  return { event, distinctId, sessionId, timestamp: 1000 + offsetMs }
}

describe('computeFunnelResults', () => {
  it('counts users who completed all steps', () => {
    const events = [
      makeEvent('page_view', 'u1', 's1', 0),
      makeEvent('test_started', 'u1', 's1', 1000),
      makeEvent('share_clicked', 'u1', 's1', 2000),
      makeEvent('page_view', 'u2', 's2', 0),
      makeEvent('test_started', 'u2', 's2', 1000),
      // u2 never shared
    ]
    const result = computeFunnelResults(events, steps, '24h')
    expect(result.steps[0].count).toBe(2)
    expect(result.steps[1].count).toBe(2)
    expect(result.steps[2].count).toBe(1)
    expect(result.totalEntered).toBe(2)
    expect(result.totalConverted).toBe(1)
    expect(result.steps[2].conversionFromPrev).toBeCloseTo(50)
  })

  it('returns zero counts when no events', () => {
    const result = computeFunnelResults([], steps, '24h')
    expect(result.steps[0].count).toBe(0)
    expect(result.totalEntered).toBe(0)
    expect(result.totalConverted).toBe(0)
  })

  it('respects session window', () => {
    const events = [
      makeEvent('page_view', 'u1', 's1', 0),
      makeEvent('test_started', 'u1', 's2', 0), // different session
    ]
    const result = computeFunnelResults(events, steps, 'session')
    expect(result.steps[0].count).toBe(1)
    expect(result.steps[1].count).toBe(0)  // different sessionId
  })

  it('first step has null conversionFromPrev', () => {
    const events = [makeEvent('page_view', 'u1', 's1', 0)]
    const result = computeFunnelResults(events, steps, '24h')
    expect(result.steps[0].conversionFromPrev).toBeNull()
  })
})
```

```typescript
// __tests__/api/v1/analytics/funnels.test.ts
jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { GET, POST } from '@/app/api/v1/analytics/funnels/route'
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'

process.env.AI_API_KEY = 'test-key'

function makeReq(method: string, body?: object, search = '') {
  return new NextRequest(`http://localhost/api/v1/analytics/funnels${search}`, {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockDb(docs: object[] = []) {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'f1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
    add: jest.fn().mockResolvedValue({ id: 'new-funnel' }),
  })
}

describe('GET /api/v1/analytics/funnels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when propertyId missing', async () => {
    mockDb([])
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(400)
  })

  it('returns funnels list', async () => {
    mockDb([{ id: 'f1', name: 'My Funnel', steps: [] }])
    const res = await GET(makeReq('GET', undefined, '?propertyId=prop-1'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/analytics/funnels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a funnel', async () => {
    mockDb()
    const res = await POST(makeReq('POST', {
      propertyId: 'prop-1',
      name: 'Test Funnel',
      steps: [{ event: 'page_view' }, { event: 'test_started' }],
      window: '24h',
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when steps < 2', async () => {
    mockDb()
    const res = await POST(makeReq('POST', {
      propertyId: 'prop-1',
      name: 'Bad Funnel',
      steps: [{ event: 'page_view' }],
      window: '24h',
    }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx jest __tests__/lib/analytics/funnel-compute.test.ts __tests__/api/v1/analytics/funnels.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement funnel compute utility**

```typescript
// lib/analytics/funnel-compute.ts
import type { FunnelStep, FunnelWindow, FunnelResults, WINDOW_MS } from './types'
import { WINDOW_MS as WMS } from './types'

interface RawEvent {
  event: string
  distinctId: string
  sessionId: string
  timestamp: number
}

export function computeFunnelResults(
  events: RawEvent[],
  steps: FunnelStep[],
  window: FunnelWindow,
): FunnelResults {
  if (steps.length === 0) {
    return { steps: [], totalEntered: 0, totalConverted: 0 }
  }

  // Group events by distinctId, sorted by timestamp
  const byUser = new Map<string, RawEvent[]>()
  for (const e of events) {
    const arr = byUser.get(e.distinctId) ?? []
    arr.push(e)
    byUser.set(e.distinctId, arr)
  }
  for (const arr of byUser.values()) arr.sort((a, b) => a.timestamp - b.timestamp)

  const windowMs = window !== 'session' ? WMS[window] : Infinity

  const stepCounts = new Array(steps.length).fill(0)

  for (const userEvents of byUser.values()) {
    let stepIdx = 0
    let lastStepTime = 0
    let lastSessionId = ''

    for (const ev of userEvents) {
      if (stepIdx >= steps.length) break
      if (ev.event !== steps[stepIdx].event) continue

      if (stepIdx === 0) {
        lastStepTime = ev.timestamp
        lastSessionId = ev.sessionId
        stepCounts[0]++
        stepIdx++
      } else if (window === 'session') {
        if (ev.sessionId === lastSessionId) {
          lastStepTime = ev.timestamp
          stepCounts[stepIdx]++
          stepIdx++
        }
      } else {
        if (ev.timestamp - lastStepTime <= windowMs) {
          lastStepTime = ev.timestamp
          lastSessionId = ev.sessionId
          stepCounts[stepIdx]++
          stepIdx++
        }
      }
    }
  }

  const resultSteps = steps.map((s, i) => ({
    event: s.event,
    count: stepCounts[i],
    conversionFromPrev: i === 0
      ? null
      : stepCounts[i - 1] > 0
        ? Math.round((stepCounts[i] / stepCounts[i - 1]) * 10000) / 100
        : 0,
  }))

  return {
    steps: resultSteps,
    totalEntered: stepCounts[0],
    totalConverted: stepCounts[steps.length - 1],
  }
}
```

- [ ] **Step 4: Implement funnels list + create endpoint**

```typescript
// app/api/v1/analytics/funnels/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import { VALID_FUNNEL_WINDOWS } from '@/lib/analytics/types'
import type { ApiUser } from '@/lib/api/types'
import type { FunnelStep, FunnelWindow } from '@/lib/analytics/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  if (!propertyId) return apiError('propertyId is required', 400)

  try {
    const snap = await adminDb.collection('product_funnels')
      .where('propertyId', '==', propertyId)
      .orderBy('createdAt', 'desc')
      .get()
    return apiSuccess(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  } catch (e) {
    console.error('[analytics-funnels-get]', e)
    return apiError('Failed to query funnels', 500)
  }
})

export const POST = withAuth('admin', async (req: NextRequest, user: ApiUser) => {
  let body: { propertyId?: string; name?: string; steps?: FunnelStep[]; window?: FunnelWindow }
  try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

  const { propertyId, name, steps, window: win } = body
  if (!propertyId) return apiError('propertyId is required', 400)
  if (!name?.trim()) return apiError('name is required', 400)
  if (!Array.isArray(steps) || steps.length < 2) return apiError('At least 2 steps required', 400)
  if (win && !VALID_FUNNEL_WINDOWS.includes(win)) return apiError('Invalid window', 400)

  try {
    const ref = await adminDb.collection('product_funnels').add({
      propertyId,
      name: name.trim(),
      steps,
      window: win ?? '24h',
      ...actorFrom(user),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return apiSuccess({ id: ref.id }, 201)
  } catch (e) {
    console.error('[analytics-funnels-post]', e)
    return apiError('Failed to create funnel', 500)
  }
})
```

- [ ] **Step 5: Implement funnel detail + update + delete endpoint**

```typescript
// app/api/v1/analytics/funnels/[id]/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { VALID_FUNNEL_WINDOWS } from '@/lib/analytics/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req: NextRequest, _user: ApiUser, ctx: unknown) => {
  const { id } = await (ctx as RouteContext).params
  try {
    const snap = await adminDb.collection('product_funnels').doc(id).get()
    if (!snap.exists) return apiError('Funnel not found', 404)
    return apiSuccess({ id: snap.id, ...snap.data() })
  } catch (e) {
    console.error('[analytics-funnel-get]', e)
    return apiError('Failed to fetch funnel', 500)
  }
})

export const PUT = withAuth('admin', async (req: NextRequest, user: ApiUser, ctx: unknown) => {
  const { id } = await (ctx as RouteContext).params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

  const ref = adminDb.collection('product_funnels').doc(id)
  try {
    const snap = await ref.get()
    if (!snap.exists) return apiError('Funnel not found', 404)

    const update: Record<string, unknown> = { ...lastActorFrom(user) }
    if (body.name) update.name = String(body.name).trim()
    if (body.steps) {
      if (!Array.isArray(body.steps) || body.steps.length < 2) return apiError('At least 2 steps required', 400)
      update.steps = body.steps
    }
    if (body.window) {
      if (!VALID_FUNNEL_WINDOWS.includes(body.window as any)) return apiError('Invalid window', 400)
      update.window = body.window
    }

    await ref.update(update)
    const updated = await ref.get()
    return apiSuccess({ id: updated.id, ...updated.data() })
  } catch (e) {
    console.error('[analytics-funnel-put]', e)
    return apiError('Failed to update funnel', 500)
  }
})

export const DELETE = withAuth('admin', async (_req: NextRequest, _user: ApiUser, ctx: unknown) => {
  const { id } = await (ctx as RouteContext).params
  try {
    const snap = await adminDb.collection('product_funnels').doc(id).get()
    if (!snap.exists) return apiError('Funnel not found', 404)
    await adminDb.collection('product_funnels').doc(id).delete()
    return apiSuccess({ deleted: true })
  } catch (e) {
    console.error('[analytics-funnel-delete]', e)
    return apiError('Failed to delete funnel', 500)
  }
})
```

- [ ] **Step 6: Implement funnel results endpoint**

```typescript
// app/api/v1/analytics/funnels/[id]/results/route.ts
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { computeFunnelResults } from '@/lib/analytics/funnel-compute'
import type { ApiUser } from '@/lib/api/types'
import type { FunnelWindow } from '@/lib/analytics/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser, ctx: unknown) => {
  const { id } = await (ctx as RouteContext).params
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return apiError('from and to query params are required', 400)

  try {
    const funnelSnap = await adminDb.collection('product_funnels').doc(id).get()
    if (!funnelSnap.exists) return apiError('Funnel not found', 404)

    const funnel = funnelSnap.data()!
    const stepEvents = funnel.steps.map((s: { event: string }) => s.event) as string[]

    // Load all events for this property in the time range matching funnel step events
    const eventsSnap = await adminDb.collection('product_events')
      .where('propertyId', '==', funnel.propertyId)
      .where('serverTime', '>=', Timestamp.fromDate(new Date(from)))
      .where('serverTime', '<=', Timestamp.fromDate(new Date(to)))
      .orderBy('serverTime', 'asc')
      .limit(10000)
      .get()

    const rawEvents = eventsSnap.docs
      .map(d => {
        const data = d.data()
        return {
          event: data.event as string,
          distinctId: data.distinctId as string,
          sessionId: data.sessionId as string,
          timestamp: (data.serverTime?._seconds ?? 0) * 1000,
        }
      })
      .filter(e => stepEvents.includes(e.event))

    const results = computeFunnelResults(rawEvents, funnel.steps, funnel.window as FunnelWindow)
    return apiSuccess(results)
  } catch (e) {
    console.error('[analytics-funnel-results]', e)
    return apiError('Failed to compute funnel results', 500)
  }
})
```

- [ ] **Step 7: Run all tests to verify pass**

```bash
npx jest __tests__/lib/analytics/funnel-compute.test.ts __tests__/api/v1/analytics/funnels.test.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/api/v1/analytics/funnels/ lib/analytics/funnel-compute.ts __tests__/lib/analytics/funnel-compute.test.ts __tests__/api/v1/analytics/funnels.test.ts
git commit -m "feat(analytics): funnels CRUD + results computation endpoint"
```

---

## Task 8: Browser SDK

**Files:**
- Create: `packages/analytics-js/package.json`
- Create: `packages/analytics-js/src/index.ts`
- Modify: `package.json` (root)
- Modify: `next.config.ts`

- [ ] **Step 1: Create SDK package.json**

```json
// packages/analytics-js/package.json
{
  "name": "@partnersinbiz/analytics-js",
  "version": "0.1.0",
  "description": "Partners in Biz browser analytics SDK — PostHog-API-compatible",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "license": "MIT",
  "keywords": ["analytics", "partnersinbiz"],
  "peerDependencies": {}
}
```

- [ ] **Step 2: Create SDK source**

```typescript
// packages/analytics-js/src/index.ts

export interface InitOptions {
  ingestKey: string
  propertyId: string
  host?: string
  batchSize?: number
  flushInterval?: number
}

interface Config {
  ingestKey: string
  propertyId: string
  host: string
  batchSize: number
  flushInterval: number
}

interface EventPayload {
  event: string
  distinctId: string
  sessionId: string
  userId: string | null
  properties: Record<string, unknown>
  timestamp: string
  pageUrl: string | null
  referrer: string | null
  userAgent: string | null
  utm: Record<string, string>
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000

let _config: Config | null = null
let _queue: EventPayload[] = []
let _flushTimer: ReturnType<typeof setTimeout> | null = null
let _userId: string | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function getDistinctId(): string {
  if (!isBrowser()) return 'server'
  let id = localStorage.getItem('_pib_did')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('_pib_did', id)
  }
  return id
}

function getSessionId(): string {
  if (!isBrowser()) return 'server-session'
  const lastActivity = parseInt(localStorage.getItem('_pib_last') ?? '0', 10)
  const now = Date.now()
  let sid = localStorage.getItem('_pib_sid')
  if (!sid || (now - lastActivity) > SESSION_TIMEOUT_MS) {
    sid = crypto.randomUUID()
    localStorage.setItem('_pib_sid', sid)
  }
  localStorage.setItem('_pib_last', String(now))
  return sid
}

function getUtm(): Record<string, string> {
  if (!isBrowser()) return {}
  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
    const val = params.get(`utm_${key}`)
    if (val) utm[key] = val
  }
  return utm
}

async function flush(): Promise<void> {
  if (!_config || _queue.length === 0) return
  const batch = _queue.splice(0, _config.batchSize)
  try {
    await fetch(`${_config.host}/api/v1/analytics/ingest`, {
      method: 'POST',
      headers: {
        'x-pib-ingest-key': _config.ingestKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ propertyId: _config.propertyId, events: batch }),
      keepalive: true,
    })
  } catch {
    // Never throw — analytics must never break the host app
  }
}

function scheduleFlush(): void {
  if (!_config || _flushTimer) return
  _flushTimer = setTimeout(() => {
    _flushTimer = null
    void flush()
  }, _config.flushInterval)
}

function enqueue(payload: EventPayload): void {
  if (!_config) return
  _queue.push(payload)
  if (_queue.length >= _config.batchSize) {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null }
    void flush()
  } else {
    scheduleFlush()
  }
}

export function init(options: InitOptions): void {
  _config = {
    host: 'https://app.partnersinbiz.online',
    batchSize: 10,
    flushInterval: 5000,
    ...options,
  }

  if (isBrowser()) {
    const originalPush = history.pushState.bind(history)
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPush(...args)
      track('$pageview')
    }
    window.addEventListener('popstate', () => track('$pageview'))
    window.addEventListener('pagehide', () => { void flush() })
    track('$pageview')
  }
}

export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (!_config) return
  enqueue({
    event,
    distinctId: getDistinctId(),
    sessionId: getSessionId(),
    userId: _userId,
    properties,
    timestamp: new Date().toISOString(),
    pageUrl: isBrowser() ? window.location.href : null,
    referrer: isBrowser() ? (document.referrer || null) : null,
    userAgent: isBrowser() ? navigator.userAgent : null,
    utm: getUtm(),
  })
}

export function identify(userId: string, traits: Record<string, unknown> = {}): void {
  if (!_config) return
  _userId = userId
  track('$identify', { userId, ...traits })
}

export function page(properties: Record<string, unknown> = {}): void {
  track('$pageview', properties)
}
```

- [ ] **Step 3: Add SDK to root package.json**

Open `package.json`. In the `"dependencies"` block, add:

```json
"@partnersinbiz/analytics-js": "file:./packages/analytics-js"
```

- [ ] **Step 4: Update next.config.ts to transpile the SDK**

Replace the full content of `next.config.ts`:

```typescript
// next.config.ts
import path from 'path'

const nextConfig: any = {
  turbopack: {
    root: path.resolve('.'),
  },
  transpilePackages: ['@partnersinbiz/analytics-js'],
}

export default nextConfig
```

- [ ] **Step 5: Install the local package**

```bash
npm install
```

Expected: `package-lock.json` updated with `@partnersinbiz/analytics-js` linked to `packages/analytics-js`.

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -10
```

Expected: Build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/analytics-js/ package.json package-lock.json next.config.ts
git commit -m "feat(analytics): add @partnersinbiz/analytics-js browser SDK"
```

---

## Task 9: Admin Sidebar + Analytics Events Page

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`
- Create: `app/(admin)/admin/analytics/page.tsx`
- Create: `app/(admin)/admin/analytics/events/page.tsx`

- [ ] **Step 1: Add Analytics entry to AdminSidebar**

In `components/admin/AdminSidebar.tsx`, find `OPERATOR_NAV` and add the Analytics entry after Properties:

```typescript
const OPERATOR_NAV: NavItem[] = [
  { label: 'Dashboard',   href: '/admin/dashboard',          icon: '⊞' },
  { label: 'Properties',  href: '/admin/properties',         icon: '◉' },
  { label: 'Analytics',   href: '/admin/analytics',          icon: '◎' },
  { label: 'Pipeline',    href: '/admin/crm/contacts',       icon: '⟳' },
  // ... rest unchanged
]
```

- [ ] **Step 2: Create analytics landing (redirect)**

```typescript
// app/(admin)/admin/analytics/page.tsx
import { redirect } from 'next/navigation'

export default function AnalyticsPage() {
  redirect('/admin/analytics/events')
}
```

- [ ] **Step 3: Create Events page**

```typescript
// app/(admin)/admin/analytics/events/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AnalyticsEvent {
  id: string
  event: string
  distinctId: string
  sessionId: string
  propertyId: string
  pageUrl: string | null
  country: string | null
  device: string | null
  serverTime: any
  properties: Record<string, unknown>
}

function formatTs(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleString()
}

export default function AnalyticsEventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [propertyId, setPropertyId] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function fetchEvents() {
    if (!propertyId.trim()) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ propertyId: propertyId.trim() })
      if (eventFilter) params.set('event', eventFilter)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/v1/analytics/events?${params}`)
      if (!res.ok) throw new Error('Failed')
      const body = await res.json()
      setEvents(body.data)
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-headline font-bold text-on-surface">Events</h1>

      <div className="pib-card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Property ID</label>
          <input
            type="text"
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            placeholder="prop-abc123"
            className="pib-input text-sm w-56"
          />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Event name</label>
          <input
            type="text"
            value={eventFilter}
            onChange={e => setEventFilter(e.target.value)}
            placeholder="test_started"
            className="pib-input text-sm w-40"
          />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="pib-input text-sm" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="pib-input text-sm" />
        </div>
        <button onClick={fetchEvents} disabled={!propertyId || loading} className="pib-btn-primary text-sm font-label">
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

      {events.length > 0 && (
        <div className="pib-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)]">
                {['Time', 'Event', 'User', 'Session', 'Page', 'Device', 'Country'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-on-surface-variant font-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr
                  key={ev.id}
                  onClick={() => router.push(`/admin/analytics/sessions/${ev.sessionId}`)}
                  className="border-b border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container)] cursor-pointer"
                >
                  <td className="px-3 py-2 text-on-surface-variant">{formatTs(ev.serverTime)}</td>
                  <td className="px-3 py-2 font-mono text-on-surface">{ev.event}</td>
                  <td className="px-3 py-2 text-on-surface-variant font-mono">{ev.distinctId.slice(0, 12)}…</td>
                  <td className="px-3 py-2 text-on-surface-variant font-mono">{ev.sessionId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-on-surface-variant">{ev.pageUrl ? new URL(ev.pageUrl).pathname : '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{ev.device ?? '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{ev.country ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && events.length === 0 && propertyId && (
        <div className="pib-card p-8 text-center text-on-surface-variant text-sm">No events found.</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run build to check for TypeScript errors**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminSidebar.tsx app/\(admin\)/admin/analytics/
git commit -m "feat(analytics): admin sidebar nav + events page"
```

---

## Task 10: Sessions Admin UI

**Files:**
- Create: `app/(admin)/admin/analytics/sessions/page.tsx`
- Create: `app/(admin)/admin/analytics/sessions/[id]/page.tsx`

- [ ] **Step 1: Create Sessions list page**

```typescript
// app/(admin)/admin/analytics/sessions/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Session {
  id: string
  distinctId: string
  eventCount: number
  pageCount: number
  device: string | null
  country: string | null
  utmSource: string | null
  startedAt: any
  lastActivityAt: any
}

function formatTs(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleString()
}

function durationLabel(start: any, end: any): string {
  if (!start || !end) return '—'
  const s = (start._seconds ?? 0)
  const e = (end._seconds ?? 0)
  const diff = e - s
  if (diff < 60) return `${diff}s`
  return `${Math.floor(diff / 60)}m ${diff % 60}s`
}

export default function SessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [propertyId, setPropertyId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function fetchSessions() {
    if (!propertyId.trim()) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ propertyId: propertyId.trim() })
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/v1/analytics/sessions?${params}`)
      if (!res.ok) throw new Error('Failed')
      const body = await res.json()
      setSessions(body.data)
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-headline font-bold text-on-surface">Sessions</h1>

      <div className="pib-card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Property ID</label>
          <input
            type="text"
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            placeholder="prop-abc123"
            className="pib-input text-sm w-56"
          />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="pib-input text-sm" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="pib-input text-sm" />
        </div>
        <button onClick={fetchSessions} disabled={!propertyId || loading} className="pib-btn-primary text-sm font-label">
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="pib-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)]">
                {['Started', 'User', 'Duration', 'Events', 'Pages', 'Device', 'Country', 'UTM Source'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-on-surface-variant font-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/admin/analytics/sessions/${s.id}`)}
                  className="border-b border-[var(--color-outline-variant)] hover:bg-[var(--color-surface-container)] cursor-pointer"
                >
                  <td className="px-3 py-2 text-on-surface-variant">{formatTs(s.startedAt)}</td>
                  <td className="px-3 py-2 font-mono text-on-surface">{s.distinctId.slice(0, 12)}…</td>
                  <td className="px-3 py-2 text-on-surface-variant">{durationLabel(s.startedAt, s.lastActivityAt)}</td>
                  <td className="px-3 py-2 text-on-surface">{s.eventCount}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{s.pageCount}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{s.device ?? '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{s.country ?? '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{s.utmSource ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sessions.length === 0 && propertyId && (
        <div className="pib-card p-8 text-center text-on-surface-variant text-sm">No sessions found.</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create Session detail page**

```typescript
// app/(admin)/admin/analytics/sessions/[id]/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface SessionDetail {
  session: {
    id: string
    distinctId: string
    userId: string | null
    eventCount: number
    pageCount: number
    device: string | null
    country: string | null
    utmSource: string | null
    utmMedium: string | null
    utmCampaign: string | null
    landingUrl: string | null
    startedAt: any
    lastActivityAt: any
  }
  events: Array<{
    id: string
    event: string
    properties: Record<string, unknown>
    pageUrl: string | null
    serverTime: any
  }>
}

function formatTs(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleString()
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/v1/analytics/sessions/${id}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then(body => { setData(body.data); setLoading(false) })
      .catch(() => { setLoading(false); router.push('/admin/analytics/sessions') })
  }, [id, router])

  if (loading) return <div className="pib-skeleton h-40 rounded-xl max-w-4xl mx-auto" />
  if (!data) return null

  const { session, events } = data

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin/analytics/sessions')} className="text-on-surface-variant hover:text-on-surface text-sm">
          ← Sessions
        </button>
        <span className="text-on-surface-variant">/</span>
        <h1 className="text-lg font-headline font-bold text-on-surface font-mono">{id.slice(0, 16)}…</h1>
      </div>

      <div className="pib-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        {[
          ['User', session.distinctId.slice(0, 16) + '…'],
          ['Events', session.eventCount],
          ['Pages', session.pageCount],
          ['Device', session.device ?? '—'],
          ['Country', session.country ?? '—'],
          ['UTM Source', session.utmSource ?? '—'],
          ['Started', formatTs(session.startedAt)],
          ['Last Active', formatTs(session.lastActivityAt)],
        ].map(([label, value]) => (
          <div key={label as string}>
            <p className="text-xs text-on-surface-variant font-label mb-0.5">{label}</p>
            <p className="text-on-surface font-medium text-xs">{value}</p>
          </div>
        ))}
      </div>

      <div className="pib-card divide-y divide-[var(--color-outline-variant)]">
        <div className="px-4 py-2 text-xs font-label text-on-surface-variant">
          Event Timeline ({events.length})
        </div>
        {events.map(ev => (
          <div key={ev.id} className="px-4 py-3 flex items-start gap-4 text-xs">
            <span className="text-on-surface-variant shrink-0 w-40">{formatTs(ev.serverTime)}</span>
            <span className="font-mono text-on-surface font-medium">{ev.event}</span>
            {ev.pageUrl && (
              <span className="text-on-surface-variant truncate max-w-xs">
                {new URL(ev.pageUrl).pathname}
              </span>
            )}
            {Object.keys(ev.properties).length > 0 && (
              <span className="text-on-surface-variant truncate max-w-xs font-mono">
                {JSON.stringify(ev.properties).slice(0, 80)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/analytics/sessions/"
git commit -m "feat(analytics): sessions list + detail pages"
```

---

## Task 11: Funnels Admin UI

**Files:**
- Create: `app/(admin)/admin/analytics/funnels/page.tsx`

- [ ] **Step 1: Create Funnels page**

```typescript
// app/(admin)/admin/analytics/funnels/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import type { FunnelResults } from '@/lib/analytics/types'
import { VALID_FUNNEL_WINDOWS } from '@/lib/analytics/types'

interface Funnel {
  id: string
  name: string
  propertyId: string
  steps: Array<{ event: string }>
  window: string
}

export default function FunnelsPage() {
  const [propertyId, setPropertyId] = useState('')
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSteps, setNewSteps] = useState(['', ''])
  const [newWindow, setNewWindow] = useState('24h')
  const [selectedFunnel, setSelectedFunnel] = useState<string | null>(null)
  const [results, setResults] = useState<FunnelResults | null>(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [error, setError] = useState('')

  async function fetchFunnels() {
    if (!propertyId.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/analytics/funnels?propertyId=${encodeURIComponent(propertyId)}`)
      if (!res.ok) throw new Error('Failed')
      const body = await res.json()
      setFunnels(body.data)
    } catch {
      setFunnels([])
    } finally {
      setLoading(false)
    }
  }

  async function createFunnel() {
    const steps = newSteps.filter(s => s.trim()).map(event => ({ event: event.trim() }))
    if (steps.length < 2) { setError('At least 2 steps required'); return }
    setError('')
    setCreating(true)
    try {
      const res = await fetch('/api/v1/analytics/funnels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ propertyId, name: newName, steps, window: newWindow }),
      })
      if (!res.ok) {
        const b = await res.json()
        throw new Error(b.error ?? 'Failed')
      }
      setNewName(''); setNewSteps(['', '']); setNewWindow('24h')
      await fetchFunnels()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create funnel')
    } finally {
      setCreating(false)
    }
  }

  async function viewResults(funnelId: string) {
    setSelectedFunnel(funnelId)
    setResultsLoading(true)
    try {
      const to = new Date().toISOString()
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const res = await fetch(`/api/v1/analytics/funnels/${funnelId}/results?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Failed')
      const body = await res.json()
      setResults(body.data)
    } catch {
      setResults(null)
    } finally {
      setResultsLoading(false)
    }
  }

  async function deleteFunnel(funnelId: string) {
    if (!confirm('Delete this funnel?')) return
    await fetch(`/api/v1/analytics/funnels/${funnelId}`, { method: 'DELETE' })
    setFunnels(f => f.filter(x => x.id !== funnelId))
    if (selectedFunnel === funnelId) { setSelectedFunnel(null); setResults(null) }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-headline font-bold text-on-surface">Funnels</h1>

      <div className="pib-card p-4 flex gap-3 items-end">
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Property ID</label>
          <input
            type="text"
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            placeholder="prop-abc123"
            className="pib-input text-sm w-56"
          />
        </div>
        <button onClick={fetchFunnels} disabled={!propertyId || loading} className="pib-btn-primary text-sm font-label">
          {loading ? 'Loading…' : 'Load Funnels'}
        </button>
      </div>

      {/* Create funnel form */}
      {propertyId && (
        <div className="pib-card p-4 space-y-4">
          <h2 className="text-sm font-label font-semibold text-on-surface">Create Funnel</h2>
          <div>
            <label className="text-xs text-on-surface-variant font-label block mb-1">Name</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="App Store Conversion" className="pib-input text-sm w-72" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-on-surface-variant font-label block">Steps (event names)</label>
            {newSteps.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-xs text-on-surface-variant w-6">{i + 1}.</span>
                <input
                  type="text"
                  value={s}
                  onChange={e => setNewSteps(steps => steps.map((x, j) => j === i ? e.target.value : x))}
                  placeholder="event_name"
                  className="pib-input text-sm w-56"
                />
                {newSteps.length > 2 && (
                  <button onClick={() => setNewSteps(steps => steps.filter((_, j) => j !== i))} className="text-xs text-red-400">✕</button>
                )}
              </div>
            ))}
            <button onClick={() => setNewSteps(s => [...s, ''])} className="pib-btn-secondary text-xs px-3 py-1.5">
              + Add Step
            </button>
          </div>
          <div>
            <label className="text-xs text-on-surface-variant font-label block mb-1">Conversion Window</label>
            <select value={newWindow} onChange={e => setNewWindow(e.target.value)} className="pib-input text-sm w-32">
              {VALID_FUNNEL_WINDOWS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={createFunnel} disabled={creating || !newName.trim()} className="pib-btn-primary text-sm font-label">
            {creating ? 'Creating…' : 'Create Funnel'}
          </button>
        </div>
      )}

      {/* Funnels list */}
      {funnels.length > 0 && (
        <div className="space-y-4">
          {funnels.map(f => (
            <div key={f.id} className="pib-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-label font-semibold text-on-surface">{f.name}</h3>
                  <p className="text-xs text-on-surface-variant">
                    {f.steps.map(s => s.event).join(' → ')} · window: {f.window}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => viewResults(f.id)} className="pib-btn-secondary text-xs px-3 py-1.5">
                    View Results
                  </button>
                  <button onClick={() => deleteFunnel(f.id)} className="pib-btn-secondary text-xs px-3 py-1.5 text-red-400">
                    Delete
                  </button>
                </div>
              </div>

              {selectedFunnel === f.id && (
                <div className="border-t border-[var(--color-outline-variant)] pt-3">
                  {resultsLoading && <div className="pib-skeleton h-12 rounded-lg" />}
                  {!resultsLoading && results && (
                    <div className="space-y-2">
                      <p className="text-xs text-on-surface-variant font-label">Last 30 days</p>
                      <div className="flex gap-4 flex-wrap">
                        {results.steps.map((step, i) => (
                          <div key={i} className="text-center">
                            <p className="text-xs font-mono text-on-surface">{step.event}</p>
                            <p className="text-lg font-bold text-on-surface">{step.count}</p>
                            {step.conversionFromPrev !== null && (
                              <p className="text-xs text-on-surface-variant">{step.conversionFromPrev}% from prev</p>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        Total: {results.totalEntered} entered → {results.totalConverted} converted
                        ({results.totalEntered > 0 ? Math.round(results.totalConverted / results.totalEntered * 100) : 0}%)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && funnels.length === 0 && propertyId && (
        <div className="pib-card p-8 text-center text-on-surface-variant text-sm">
          No funnels yet — create one above.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/analytics/funnels/"
git commit -m "feat(analytics): funnels admin page with builder and conversion results"
```

---

## Task 12: Firestore Indexes + Security Rules

**Files:**
- Modify: `firestore.indexes.json`
- Modify: `firestore.rules`

- [ ] **Step 1: Add analytics indexes to firestore.indexes.json**

Append these entries to the `"indexes"` array (before the closing `]`):

```json
{
  "collectionGroup": "product_events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "orgId", "order": "ASCENDING" },
    { "fieldPath": "propertyId", "order": "ASCENDING" },
    { "fieldPath": "event", "order": "ASCENDING" },
    { "fieldPath": "serverTime", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "product_events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "propertyId", "order": "ASCENDING" },
    { "fieldPath": "serverTime", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "product_events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "propertyId", "order": "ASCENDING" },
    { "fieldPath": "event", "order": "ASCENDING" },
    { "fieldPath": "serverTime", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "product_events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "propertyId", "order": "ASCENDING" },
    { "fieldPath": "distinctId", "order": "ASCENDING" },
    { "fieldPath": "serverTime", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "product_events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sessionId", "order": "ASCENDING" },
    { "fieldPath": "serverTime", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "product_sessions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "propertyId", "order": "ASCENDING" },
    { "fieldPath": "startedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "product_funnels",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "propertyId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "analytics_rate_limits",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "ingestKey", "order": "ASCENDING" },
    { "fieldPath": "minuteBucket", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 2: Add security rules to firestore.rules**

Before the final closing braces, add:

```
    // Analytics — all written via Admin SDK (ingest endpoint), all queried via admin-authed API
    match /product_events/{id} {
      allow read, write: if false;
    }

    match /product_sessions/{id} {
      allow read, write: if false;
    }

    match /product_funnels/{id} {
      allow read, write: if false;
    }

    // Analytics rate limiting — internal only
    match /analytics_rate_limits/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 3: Deploy indexes**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx firebase deploy --only firestore:indexes --project partners-in-biz-85059
```

Expected: `Deploy complete!`

- [ ] **Step 4: Deploy rules**

```bash
npx firebase deploy --only firestore:rules --project partners-in-biz-85059
```

Expected: `Deploy complete!`

- [ ] **Step 5: Run full properties + analytics tests**

```bash
npx jest --no-coverage "__tests__/api/v1/analytics" "__tests__/lib/analytics" "__tests__/api/v1/properties" "__tests__/lib/properties" 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add firestore.indexes.json firestore.rules
git commit -m "feat(analytics): Firestore indexes and security rules for analytics collections"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `product_events` collection with all spec fields
- [x] `product_sessions` with session correlation on ingest
- [x] `product_funnels` CRUD
- [x] `POST /api/v1/analytics/ingest` — public, x-pib-ingest-key, batch 50, 100 req/min
- [x] Rate limit: 100 req/min per ingest key, Firestore-backed
- [x] IP salted-hashed before storage
- [x] Device detection from UA
- [x] Country from `x-vercel-ip-country` header
- [x] Session upsert on ingest (eventCount, pageCount, UTMs, landingUrl)
- [x] `GET /api/v1/analytics/events` with propertyId/event/from/to/distinctId filters
- [x] `GET /api/v1/analytics/events/count` grouped by event name
- [x] `GET /api/v1/analytics/sessions` with propertyId/from/to
- [x] `GET /api/v1/analytics/sessions/:id` — session + full event timeline
- [x] `GET/POST /api/v1/analytics/funnels`
- [x] `GET/PUT/DELETE /api/v1/analytics/funnels/:id`
- [x] `GET /api/v1/analytics/funnels/:id/results` — conversion computation
- [x] `@partnersinbiz/analytics-js` browser SDK with init/track/identify/page
- [x] Auto distinctId (localStorage), auto sessionId (30min rotation)
- [x] Auto page views on pushState/popstate
- [x] Event batching (flush every 5s or 10 events or pagehide)
- [x] Admin UI: Events table with filters
- [x] Admin UI: Sessions list + session detail
- [x] Admin UI: Funnels builder + conversion results
- [x] Firestore composite indexes
- [x] Firestore security rules (deny all direct client access)
