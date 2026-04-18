# Properties Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Marketing Properties module — a first-class Firestore record for every deployed marketing site/app, with runtime config, ingest key scoping, and a full admin UI.

**Architecture:** Each `Property` document in Firestore represents one deployed marketing site (e.g. `scrolledbrain.com`). An `ingestKey` on each property is a public-safe token scoped to write events and fetch config. The public `GET /:id/config` endpoint is CDN-cacheable (60s), letting micro-sites fetch their App Store URLs, kill switch, and feature flags at runtime without a redeploy. Admin CRUD is behind `withAuth('admin')`.

**Tech Stack:** Next.js 15 App Router · Firebase Admin SDK · TypeScript · Tailwind (existing pib design system) · Jest + ts-jest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/properties/types.ts` | Create | Shared TypeScript types for Property |
| `lib/properties/ingest-key.ts` | Create | Generate and validate property-scoped ingest keys |
| `app/api/v1/properties/route.ts` | Create | GET list + POST create |
| `app/api/v1/properties/[id]/route.ts` | Create | GET detail, PUT update, DELETE (soft) |
| `app/api/v1/properties/[id]/rotate-ingest-key/route.ts` | Create | POST rotate |
| `app/api/v1/properties/[id]/config/route.ts` | Create | GET public config (CDN-cached, ingest-key auth) |
| `__tests__/api/v1/properties/route.test.ts` | Create | Unit tests — list + create |
| `__tests__/api/v1/properties/[id]/route.test.ts` | Create | Unit tests — detail, update, delete |
| `__tests__/api/v1/properties/[id]/config.test.ts` | Create | Unit tests — public config endpoint |
| `__tests__/lib/properties/ingest-key.test.ts` | Create | Unit tests — key generation |
| `app/(admin)/admin/properties/page.tsx` | Create | Properties list page |
| `app/(admin)/admin/properties/[id]/page.tsx` | Create | Property detail page with tabs |
| `components/admin/AdminSidebar.tsx` | Modify | Add Properties nav entry |

---

## Task 1: TypeScript Types

**Files:**
- Create: `lib/properties/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// lib/properties/types.ts

export type PropertyType = 'web' | 'ios' | 'android' | 'universal'
export type PropertyStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface PropertyConfig {
  appStoreUrl?: string
  playStoreUrl?: string
  primaryCtaUrl?: string
  siteUrl?: string
  killSwitch?: boolean
  featureFlags?: Record<string, boolean | string>
  customConfig?: Record<string, unknown>
}

export interface Property {
  id: string
  orgId: string
  name: string
  domain: string
  type: PropertyType
  status: PropertyStatus
  config: PropertyConfig
  conversionSequenceId?: string
  emailSenderDomain?: string
  creatorLinkPrefix?: string
  ingestKey: string
  ingestKeyRotatedAt: unknown // Firestore Timestamp — serialised as { _seconds, _nanoseconds }
  createdAt: unknown
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  updatedAt: unknown
  updatedBy?: string
  updatedByType?: 'user' | 'agent' | 'system'
  deleted?: boolean
}

export interface CreatePropertyInput {
  orgId: string
  name: string
  domain: string
  type: PropertyType
  status?: PropertyStatus
  config?: PropertyConfig
  conversionSequenceId?: string
  emailSenderDomain?: string
  creatorLinkPrefix?: string
}

export interface UpdatePropertyInput {
  name?: string
  domain?: string
  type?: PropertyType
  status?: PropertyStatus
  config?: PropertyConfig
  conversionSequenceId?: string
  emailSenderDomain?: string
  creatorLinkPrefix?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/properties/types.ts
git commit -m "feat(properties): add TypeScript types"
```

---

## Task 2: Ingest Key Utility

**Files:**
- Create: `lib/properties/ingest-key.ts`
- Create: `__tests__/lib/properties/ingest-key.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/properties/ingest-key.test.ts
import { generateIngestKey, isValidIngestKeyFormat } from '@/lib/properties/ingest-key'

describe('generateIngestKey', () => {
  it('returns a 64-char lowercase hex string', () => {
    const key = generateIngestKey()
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a unique key on each call', () => {
    const keys = new Set(Array.from({ length: 10 }, generateIngestKey))
    expect(keys.size).toBe(10)
  })
})

describe('isValidIngestKeyFormat', () => {
  it('accepts a valid 64-char hex key', () => {
    expect(isValidIngestKeyFormat('a'.repeat(64))).toBe(true)
  })

  it('rejects a short key', () => {
    expect(isValidIngestKeyFormat('a'.repeat(63))).toBe(false)
  })

  it('rejects non-hex characters', () => {
    expect(isValidIngestKeyFormat('g' + 'a'.repeat(63))).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidIngestKeyFormat('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx jest __tests__/lib/properties/ingest-key.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/properties/ingest-key'`

- [ ] **Step 3: Implement**

```typescript
// lib/properties/ingest-key.ts
import { randomBytes } from 'node:crypto'

export function generateIngestKey(): string {
  return randomBytes(32).toString('hex')
}

export function isValidIngestKeyFormat(key: string): boolean {
  return /^[0-9a-f]{64}$/.test(key)
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest __tests__/lib/properties/ingest-key.test.ts --no-coverage
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/properties/ingest-key.ts __tests__/lib/properties/ingest-key.test.ts
git commit -m "feat(properties): add ingest key generator utility"
```

---

## Task 3: Properties List + Create API

**Files:**
- Create: `app/api/v1/properties/route.ts`
- Create: `__tests__/api/v1/properties/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/v1/properties/route.test.ts
import { GET, POST } from '@/app/api/v1/properties/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

jest.mock('@/lib/webhooks/dispatch', () => ({
  dispatchWebhook: jest.fn().mockResolvedValue(undefined),
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

function makeReq(method: string, body?: object, search = '') {
  return new NextRequest(`http://localhost/api/v1/properties${search}`, {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockCollection(docs: object[], addId = 'new-prop-id') {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'prop-1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
    add: jest.fn().mockResolvedValue({ id: addId }),
  })
}

const validProperty = {
  orgId: 'org-lumen',
  name: 'Scrolled Brain',
  domain: 'scrolledbrain.com',
  type: 'web',
}

describe('GET /api/v1/properties', () => {
  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/properties')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when orgId is missing', async () => {
    mockCollection([])
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(400)
  })

  it('returns list of properties for an org', async () => {
    mockCollection([{ id: 'p1', orgId: 'org-lumen', name: 'Scrolled Brain', deleted: false }])
    const res = await GET(makeReq('GET', undefined, '?orgId=org-lumen'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe('POST /api/v1/properties', () => {
  it('creates a property and returns 201 with an ingestKey', async () => {
    mockCollection([], 'created-id')
    const res = await POST(makeReq('POST', validProperty))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('created-id')
    expect(body.data.ingestKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns 400 when required fields are missing', async () => {
    mockCollection([])
    const res = await POST(makeReq('POST', { orgId: 'org-lumen' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type enum', async () => {
    mockCollection([])
    const res = await POST(makeReq('POST', { ...validProperty, type: 'invalid' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest __tests__/api/v1/properties/route.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/api/v1/properties/route'`

- [ ] **Step 3: Implement**

```typescript
// app/api/v1/properties/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import { generateIngestKey } from '@/lib/properties/ingest-key'
import type { CreatePropertyInput, PropertyType, PropertyStatus } from '@/lib/properties/types'

export const dynamic = 'force-dynamic'

const VALID_TYPES: PropertyType[] = ['web', 'ios', 'android', 'universal']
const VALID_STATUSES: PropertyStatus[] = ['draft', 'active', 'paused', 'archived']
const DEFAULT_LIMIT = 50

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required', 400)

  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const rawLimit = parseInt(searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), 200)
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0)

  let query = adminDb.collection('properties')
    .where('orgId', '==', orgId)
    .where('deleted', '==', false)
    .orderBy('createdAt', 'desc')

  if (status && VALID_STATUSES.includes(status as PropertyStatus)) {
    query = query.where('status', '==', status) as any
  }
  if (type && VALID_TYPES.includes(type as PropertyType)) {
    query = query.where('type', '==', type) as any
  }

  const snap = await query.limit(limit).offset(offset).get()
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  return apiSuccess(data)
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const body = await req.json() as CreatePropertyInput

  if (!body.orgId?.trim()) return apiError('orgId is required', 400)
  if (!body.name?.trim()) return apiError('name is required', 400)
  if (!body.domain?.trim()) return apiError('domain is required', 400)
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return apiError(`type must be one of: ${VALID_TYPES.join(', ')}`, 400)
  }

  const ingestKey = generateIngestKey()

  const doc = {
    orgId: body.orgId.trim(),
    name: body.name.trim(),
    domain: body.domain.trim().toLowerCase(),
    type: body.type,
    status: (body.status && VALID_STATUSES.includes(body.status)) ? body.status : 'draft',
    config: body.config ?? {},
    conversionSequenceId: body.conversionSequenceId ?? null,
    emailSenderDomain: body.emailSenderDomain ?? null,
    creatorLinkPrefix: body.creatorLinkPrefix ?? null,
    ingestKey,
    ingestKeyRotatedAt: FieldValue.serverTimestamp(),
    deleted: false,
    ...actorFrom(user),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('properties').add(doc)

  return apiSuccess({ id: ref.id, ...doc, ingestKey }, 201)
})
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest __tests__/api/v1/properties/route.test.ts --no-coverage
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/properties/route.ts __tests__/api/v1/properties/route.test.ts
git commit -m "feat(properties): GET list + POST create API"
```

---

## Task 4: Property Detail API (GET / PUT / DELETE)

**Files:**
- Create: `app/api/v1/properties/[id]/route.ts`
- Create: `__tests__/api/v1/properties/[id]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/v1/properties/[id]/route.test.ts
import { GET, PUT, DELETE } from '@/app/api/v1/properties/[id]/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

const CTX = { params: { id: 'prop-123' } }

function makeReq(method: string, body?: object) {
  return new NextRequest('http://localhost/api/v1/properties/prop-123', {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const existingDoc = {
  id: 'prop-123',
  orgId: 'org-lumen',
  name: 'Scrolled Brain',
  domain: 'scrolledbrain.com',
  type: 'web',
  status: 'active',
  config: {},
  ingestKey: 'a'.repeat(64),
  deleted: false,
}

function mockDocFound(data = existingDoc) {
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: true, id: data.id, data: () => data }),
      update: jest.fn().mockResolvedValue(undefined),
    }),
  })
}

function mockDocNotFound() {
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false }),
    }),
  })
}

describe('GET /api/v1/properties/:id', () => {
  it('returns 404 when not found', async () => {
    mockDocNotFound()
    const res = await GET(makeReq('GET'), CTX)
    expect(res.status).toBe(404)
  })

  it('returns the property when found', async () => {
    mockDocFound()
    const res = await GET(makeReq('GET'), CTX)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('prop-123')
    expect(body.data.name).toBe('Scrolled Brain')
  })
})

describe('PUT /api/v1/properties/:id', () => {
  it('returns 404 when not found', async () => {
    mockDocNotFound()
    const res = await PUT(makeReq('PUT', { name: 'New Name' }), CTX)
    expect(res.status).toBe(404)
  })

  it('updates and returns the property', async () => {
    mockDocFound()
    const res = await PUT(makeReq('PUT', { name: 'Updated Name', status: 'active' }), CTX)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 400 for invalid status enum', async () => {
    mockDocFound()
    const res = await PUT(makeReq('PUT', { status: 'invalid' }), CTX)
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/v1/properties/:id', () => {
  it('returns 404 when not found', async () => {
    mockDocNotFound()
    const res = await DELETE(makeReq('DELETE'), CTX)
    expect(res.status).toBe(404)
  })

  it('soft-deletes and returns 200', async () => {
    mockDocFound()
    const res = await DELETE(makeReq('DELETE'), CTX)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest "__tests__/api/v1/properties/\[id\]/route.test.ts" --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// app/api/v1/properties/[id]/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { UpdatePropertyInput, PropertyType, PropertyStatus } from '@/lib/properties/types'

export const dynamic = 'force-dynamic'

const VALID_TYPES: PropertyType[] = ['web', 'ios', 'android', 'universal']
const VALID_STATUSES: PropertyStatus[] = ['draft', 'active', 'paused', 'archived']

export const GET = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const id = (ctx?.params as { id: string }).id
  const ref = adminDb.collection('properties').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  return apiSuccess({ id: snap.id, ...snap.data() })
})

export const PUT = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const id = (ctx?.params as { id: string }).id
  const ref = adminDb.collection('properties').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)

  const body = await req.json() as UpdatePropertyInput

  if (body.type !== undefined && !VALID_TYPES.includes(body.type)) {
    return apiError(`type must be one of: ${VALID_TYPES.join(', ')}`, 400)
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return apiError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400)
  }

  const allowed: (keyof UpdatePropertyInput)[] = [
    'name', 'domain', 'type', 'status', 'config',
    'conversionSequenceId', 'emailSenderDomain', 'creatorLinkPrefix',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  if (updates.domain) updates.domain = (updates.domain as string).trim().toLowerCase()
  if (updates.name) updates.name = (updates.name as string).trim()

  await ref.update({ ...updates, ...lastActorFrom(user) })

  const updated = await ref.get()
  return apiSuccess({ id: updated.id, ...updated.data() })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const id = (ctx?.params as { id: string }).id
  const ref = adminDb.collection('properties').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)

  await ref.update({
    deleted: true,
    status: 'archived',
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, deleted: true })
})
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest "__tests__/api/v1/properties/\[id\]/route.test.ts" --no-coverage
```

Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/properties/[id]/route.ts" "__tests__/api/v1/properties/[id]/route.test.ts"
git commit -m "feat(properties): GET detail + PUT update + DELETE (soft) API"
```

---

## Task 5: Rotate Ingest Key Endpoint

**Files:**
- Create: `app/api/v1/properties/[id]/rotate-ingest-key/route.ts`

- [ ] **Step 1: Write the failing test** (add to `__tests__/api/v1/properties/[id]/route.test.ts`)

Append to that file:

```typescript
// Add at the bottom of __tests__/api/v1/properties/[id]/route.test.ts
import { POST as ROTATE } from '@/app/api/v1/properties/[id]/rotate-ingest-key/route'

describe('POST /api/v1/properties/:id/rotate-ingest-key', () => {
  it('returns 404 when not found', async () => {
    mockDocNotFound()
    const res = await ROTATE(makeReq('POST'), CTX)
    expect(res.status).toBe(404)
  })

  it('returns new ingest key (64-char hex) and updatedAt', async () => {
    mockDocFound()
    const res = await ROTATE(makeReq('POST'), CTX)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.ingestKey).toMatch(/^[0-9a-f]{64}$/)
    expect(body.data.id).toBe('prop-123')
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
npx jest "__tests__/api/v1/properties/\[id\]/route.test.ts" --no-coverage
```

Expected: FAIL — 2 new failures (module not found)

- [ ] **Step 3: Implement**

```typescript
// app/api/v1/properties/[id]/rotate-ingest-key/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { generateIngestKey } from '@/lib/properties/ingest-key'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const id = (ctx?.params as { id: string }).id
  const ref = adminDb.collection('properties').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)

  const ingestKey = generateIngestKey()

  await ref.update({
    ingestKey,
    ingestKeyRotatedAt: FieldValue.serverTimestamp(),
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, ingestKey })
})
```

- [ ] **Step 4: Run to verify all tests pass**

```bash
npx jest "__tests__/api/v1/properties/\[id\]/route.test.ts" --no-coverage
```

Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/properties/[id]/rotate-ingest-key/route.ts" "__tests__/api/v1/properties/[id]/route.test.ts"
git commit -m "feat(properties): POST rotate-ingest-key endpoint"
```

---

## Task 6: Public Config Endpoint

This endpoint is intentionally public (no admin auth). It validates the `x-pib-ingest-key` header against the stored `ingestKey` for the property, then returns just the `config` object. CDN cache headers allow a 60s TTL.

**Files:**
- Create: `app/api/v1/properties/[id]/config/route.ts`
- Create: `__tests__/api/v1/properties/[id]/config.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/v1/properties/[id]/config.test.ts
import { GET } from '@/app/api/v1/properties/[id]/config/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'

const CTX = { params: { id: 'prop-123' } }
const INGEST_KEY = 'a'.repeat(64)

const storedDoc = {
  orgId: 'org-lumen',
  name: 'Scrolled Brain',
  status: 'active',
  deleted: false,
  ingestKey: INGEST_KEY,
  config: {
    appStoreUrl: 'https://apps.apple.com/app/id123',
    killSwitch: false,
    featureFlags: { cardStyle: 'meme' },
  },
}

function mockDoc(data?: object | null) {
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        data
          ? { exists: true, id: 'prop-123', data: () => data }
          : { exists: false },
      ),
    }),
  })
}

function makeReq(ingestKey?: string) {
  return new NextRequest('http://localhost/api/v1/properties/prop-123/config', {
    headers: ingestKey ? { 'x-pib-ingest-key': ingestKey } : {},
  })
}

describe('GET /api/v1/properties/:id/config', () => {
  it('returns 401 when ingest key is missing', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq(), CTX)
    expect(res.status).toBe(401)
  })

  it('returns 401 when ingest key is wrong', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq('b'.repeat(64)), CTX)
    expect(res.status).toBe(401)
  })

  it('returns 404 when property not found', async () => {
    mockDoc(null)
    const res = await GET(makeReq(INGEST_KEY), CTX)
    expect(res.status).toBe(404)
  })

  it('returns 503 when kill switch is active', async () => {
    mockDoc({ ...storedDoc, config: { killSwitch: true } })
    const res = await GET(makeReq(INGEST_KEY), CTX)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.killSwitch).toBe(true)
  })

  it('returns config with cache headers when all is valid', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq(INGEST_KEY), CTX)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.appStoreUrl).toBe('https://apps.apple.com/app/id123')
    expect(body.featureFlags?.cardStyle).toBe('meme')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60')
  })

  it('does not expose ingestKey or internal fields in the response', async () => {
    mockDoc(storedDoc)
    const res = await GET(makeReq(INGEST_KEY), CTX)
    const body = await res.json()
    expect(body.ingestKey).toBeUndefined()
    expect(body.orgId).toBeUndefined()
    expect(body.deleted).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest "__tests__/api/v1/properties/\[id\]/config.test.ts" --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// app/api/v1/properties/[id]/config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import type { PropertyConfig } from '@/lib/properties/types'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  const { id } = ctx.params
  const ingestKey = req.headers.get('x-pib-ingest-key')
  if (!ingestKey) {
    return NextResponse.json({ error: 'x-pib-ingest-key header required' }, { status: 401 })
  }

  const snap = await adminDb.collection('properties').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data = snap.data()!
  if (data.ingestKey !== ingestKey) {
    return NextResponse.json({ error: 'Invalid ingest key' }, { status: 401 })
  }

  const config: PropertyConfig = data.config ?? {}

  if (config.killSwitch) {
    return NextResponse.json(
      { killSwitch: true, message: 'This site is temporarily unavailable.' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }

  return NextResponse.json(config, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest "__tests__/api/v1/properties/\[id\]/config.test.ts" --no-coverage
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/properties/[id]/config/route.ts" "__tests__/api/v1/properties/[id]/config.test.ts"
git commit -m "feat(properties): public GET /:id/config with CDN caching + kill switch"
```

---

## Task 7: Add Properties to Admin Navigation

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Add nav entry**

In `components/admin/AdminSidebar.tsx`, find `OPERATOR_NAV` and add Properties after Dashboard:

```typescript
const OPERATOR_NAV: NavItem[] = [
  { label: 'Dashboard',   href: '/admin/dashboard',          icon: '⊞' },
  { label: 'Properties',  href: '/admin/properties',         icon: '◉' },  // ← add this line
  { label: 'Pipeline',    href: '/admin/crm/contacts',       icon: '⟳' },
  { label: 'Clients',     href: '/admin/clients',             icon: '◎' },
  { label: 'Invoicing',   href: '/admin/invoicing',           icon: '◷' },
  { label: 'Recurring',   href: '/admin/invoicing/recurring', icon: '↺' },
  { label: 'Quotes',      href: '/admin/quotes',              icon: '◈' },
  { label: 'Settings',    href: '/admin/settings',            icon: '◆' },
]
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/AdminSidebar.tsx
git commit -m "feat(properties): add Properties nav entry to admin sidebar"
```

---

## Task 8: Properties List Page

**Files:**
- Create: `app/(admin)/admin/properties/page.tsx`

- [ ] **Step 1: Implement the list page**

```tsx
// app/(admin)/admin/properties/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Property, PropertyStatus } from '@/lib/properties/types'

const STATUS_MAP: Record<PropertyStatus, { label: string; color: string }> = {
  draft:    { label: 'Draft',    color: 'var(--color-outline)' },
  active:   { label: 'Active',   color: '#4ade80' },
  paused:   { label: 'Paused',   color: '#facc15' },
  archived: { label: 'Archived', color: 'var(--color-outline)' },
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [orgMap, setOrgMap] = useState<Record<string, string>>({})
  const [orgFilter, setOrgFilter] = useState('')

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then(r => r.json())
      .then(body => {
        const map: Record<string, string> = {}
        for (const org of body.data ?? []) map[org.id] = org.name
        setOrgMap(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgFilter) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/v1/properties?orgId=${orgFilter}`)
      .then(r => r.json())
      .then(body => { setProperties(body.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [orgFilter])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Properties</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Marketing sites and apps connected to PiB
          </p>
        </div>
        <Link href="/admin/properties/new" className="pib-btn-primary text-sm font-label">
          + New Property
        </Link>
      </div>

      {/* Org filter */}
      <div className="pib-card p-4">
        <label className="text-xs text-on-surface-variant font-label block mb-1">Filter by Client</label>
        <select
          value={orgFilter}
          onChange={e => setOrgFilter(e.target.value)}
          className="pib-input text-sm w-64"
        >
          <option value="">Select a client…</option>
          {Object.entries(orgMap).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {/* Properties list */}
      {!orgFilter ? (
        <div className="pib-card p-8 text-center text-on-surface-variant text-sm">
          Select a client above to view their properties.
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : properties.length === 0 ? (
        <div className="pib-card p-8 text-center text-on-surface-variant text-sm">
          No properties yet.{' '}
          <Link href="/admin/properties/new" className="text-[var(--color-accent-text)] underline">
            Create one.
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map(p => {
            const statusInfo = STATUS_MAP[p.status] ?? STATUS_MAP.draft
            return (
              <Link
                key={p.id}
                href={`/admin/properties/${p.id}`}
                className="pib-card p-4 flex items-center justify-between hover:bg-[var(--color-surface-container)] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-lg">◉</span>
                  <div>
                    <p className="text-sm font-label font-medium text-on-surface">{p.name}</p>
                    <p className="text-xs text-on-surface-variant">{p.domain} · {p.type}</p>
                  </div>
                </div>
                <span
                  className="text-[11px] font-label px-2 py-0.5 rounded-full"
                  style={{ background: `${statusInfo.color}22`, color: statusInfo.color }}
                >
                  {statusInfo.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders without errors**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npm run build 2>&1 | tail -20
```

Expected: Build succeeds. Fix any TypeScript errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/properties/page.tsx"
git commit -m "feat(properties): add properties list page"
```

---

## Task 9: Property Detail Page — Shell + Overview + Keys Tabs

**Files:**
- Create: `app/(admin)/admin/properties/[id]/page.tsx`

- [ ] **Step 1: Implement detail page with tab shell, Overview, and Keys tabs**

```tsx
// app/(admin)/admin/properties/[id]/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Property } from '@/lib/properties/types'

type Tab = 'overview' | 'config' | 'sequences' | 'creators' | 'analytics' | 'keys'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'config',     label: 'Config' },
  { id: 'sequences',  label: 'Sequences' },
  { id: 'creators',   label: 'Creators' },
  { id: 'analytics',  label: 'Analytics' },
  { id: 'keys',       label: 'Keys' },
]

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

function formatTs(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ property }: { property: Property }) {
  return (
    <div className="space-y-4">
      <div className="pib-card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Name</p>
          <p className="text-on-surface font-medium">{property.name}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Domain</p>
          <p className="text-on-surface font-medium">{property.domain}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Type</p>
          <p className="text-on-surface">{property.type}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Status</p>
          <p className="text-on-surface">{property.status}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Created</p>
          <p className="text-on-surface">{formatTs(property.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Creator Link Prefix</p>
          <p className="text-on-surface">{property.creatorLinkPrefix ?? '—'}</p>
        </div>
      </div>
      <div className="pib-card p-4 text-sm text-on-surface-variant">
        <p className="text-xs font-label mb-1">Analytics (coming soon)</p>
        <p>Sessions and events will appear here once the Analytics module is live.</p>
      </div>
    </div>
  )
}

// ── Keys Tab ─────────────────────────────────────────────────────────────────

function KeysTab({ property, onRotate }: { property: Property; onRotate: (key: string) => void }) {
  const [rotating, setRotating] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')

  async function handleRotate() {
    if (!confirm('Rotating the ingest key will break any clients using the old key. Continue?')) return
    setRotating(true)
    setError('')
    try {
      const res = await fetch(`/api/v1/properties/${property.id}/rotate-ingest-key`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Rotation failed')
      onRotate(body.data.ingestKey)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="pib-card p-4 space-y-3">
        <p className="text-xs text-on-surface-variant font-label">Ingest Key</p>
        <p className="text-xs text-on-surface-variant">
          This key is safe to ship in client-side JavaScript. It can only write analytics events
          and fetch this property&apos;s config — it cannot read or modify any other data.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-[var(--color-surface-container)] px-3 py-2 rounded-lg font-mono break-all text-on-surface">
            {showKey ? property.ingestKey : '•'.repeat(32)}
          </code>
          <button
            onClick={() => setShowKey(v => !v)}
            className="pib-btn-secondary text-xs px-3 py-2 shrink-0"
          >
            {showKey ? 'Hide' : 'Reveal'}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant">
          Key rotated: {formatTs(property.ingestKeyRotatedAt)}
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleRotate}
          disabled={rotating}
          className="pib-btn-secondary text-xs font-label text-[var(--color-error,#ef4444)]"
        >
          {rotating ? 'Rotating…' : 'Rotate Key'}
        </button>
      </div>
      <div className="pib-card p-4 text-sm space-y-2">
        <p className="text-xs font-label text-on-surface-variant">Usage</p>
        <pre className="text-xs bg-[var(--color-surface-container)] p-3 rounded-lg overflow-x-auto">
{`// In your micro-site .env
NEXT_PUBLIC_PIB_INGEST_KEY="${property.ingestKey}"
NEXT_PUBLIC_PIB_PROPERTY_ID="${property.id}"

// lib/property-config.ts
const res = await fetch(\`\${PIB_BASE}/properties/\${propertyId}/config\`, {
  headers: { 'x-pib-ingest-key': process.env.NEXT_PUBLIC_PIB_INGEST_KEY! },
  next: { revalidate: 60 },
})
const config = await res.json()`}
        </pre>
      </div>
    </div>
  )
}

// ── Placeholder tabs ──────────────────────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="pib-card p-8 text-center text-on-surface-variant text-sm">
      {label} — coming soon.
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    fetch(`/api/v1/properties/${id}`)
      .then(r => { if (!r.ok) router.push('/admin/properties'); return r.json() })
      .then(body => { setProperty(body.data); setLoading(false) })
      .catch(() => { setLoading(false); router.push('/admin/properties') })
  }, [id, router])

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-10 w-48 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )

  if (!property) return null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/properties')}
          className="text-on-surface-variant hover:text-on-surface text-sm"
        >
          ← Properties
        </button>
        <span className="text-on-surface-variant">/</span>
        <h1 className="text-xl font-headline font-bold text-on-surface">{property.name}</h1>
        <span className="text-xs text-on-surface-variant font-mono">{property.domain}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-outline-variant)]">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-label border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-[var(--color-accent-text)] text-[var(--color-accent-text)]'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview'  && <OverviewTab property={property} />}
      {activeTab === 'config'    && <PlaceholderTab label="Config editor" />}
      {activeTab === 'sequences' && <PlaceholderTab label="Sequence linking" />}
      {activeTab === 'creators'  && <PlaceholderTab label="Creator links" />}
      {activeTab === 'analytics' && <PlaceholderTab label="Analytics (Module 2)" />}
      {activeTab === 'keys'      && (
        <KeysTab
          property={property}
          onRotate={(key) => setProperty(p => p ? { ...p, ingestKey: key } : p)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds. Fix any TS errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/properties/[id]/page.tsx"
git commit -m "feat(properties): add property detail page with Overview + Keys tabs"
```

---

## Task 10: Config Tab (JSON Editor for Feature Flags + Runtime Config)

**Files:**
- Modify: `app/(admin)/admin/properties/[id]/page.tsx`

Replace the `PlaceholderTab` for `config` with a real `ConfigTab` component. This replaces the `{activeTab === 'config' && <PlaceholderTab ... />}` line.

- [ ] **Step 1: Add `ConfigTab` component and wire it into the detail page**

Add this component definition **before** the `PlaceholderTab` function in `page.tsx`:

```tsx
// Add before PlaceholderTab in app/(admin)/admin/properties/[id]/page.tsx

function ConfigTab({ property, onSave }: { property: Property; onSave: (updated: Property) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Simple fields
  const [appStoreUrl, setAppStoreUrl] = useState(property.config?.appStoreUrl ?? '')
  const [playStoreUrl, setPlayStoreUrl] = useState(property.config?.playStoreUrl ?? '')
  const [primaryCtaUrl, setPrimaryCtaUrl] = useState(property.config?.primaryCtaUrl ?? '')
  const [siteUrl, setSiteUrl] = useState(property.config?.siteUrl ?? '')
  const [killSwitch, setKillSwitch] = useState(property.config?.killSwitch ?? false)
  const [status, setStatus] = useState(property.status)

  // JSON fields
  const [featureFlagsText, setFeatureFlagsText] = useState(
    JSON.stringify(property.config?.featureFlags ?? {}, null, 2)
  )
  const [customConfigText, setCustomConfigText] = useState(
    JSON.stringify(property.config?.customConfig ?? {}, null, 2)
  )
  const [conversionSequenceId, setConversionSequenceId] = useState(property.conversionSequenceId ?? '')
  const [creatorLinkPrefix, setCreatorLinkPrefix] = useState(property.creatorLinkPrefix ?? '')

  async function handleSave() {
    setSaving(true); setError(''); setSuccess(false)
    let featureFlags: Record<string, boolean | string> = {}
    let customConfig: Record<string, unknown> = {}
    try {
      featureFlags = JSON.parse(featureFlagsText || '{}')
      customConfig = JSON.parse(customConfigText || '{}')
    } catch {
      setError('Feature flags and custom config must be valid JSON.'); setSaving(false); return
    }

    const body = {
      status,
      config: { appStoreUrl, playStoreUrl, primaryCtaUrl, siteUrl, killSwitch, featureFlags, customConfig },
      conversionSequenceId: conversionSequenceId || null,
      creatorLinkPrefix: creatorLinkPrefix || null,
    }

    try {
      const res = await fetch(`/api/v1/properties/${property.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSave(data.data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Status</h2>
        <select value={status} onChange={e => setStatus(e.target.value as any)} className="pib-input text-sm w-48">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Store & CTA URLs</h2>
        {[
          { label: 'App Store URL', value: appStoreUrl, set: setAppStoreUrl, placeholder: 'https://apps.apple.com/…' },
          { label: 'Play Store URL', value: playStoreUrl, set: setPlayStoreUrl, placeholder: 'https://play.google.com/…' },
          { label: 'Primary CTA URL (fallback)', value: primaryCtaUrl, set: setPrimaryCtaUrl, placeholder: 'https://…' },
          { label: 'Canonical Site URL', value: siteUrl, set: setSiteUrl, placeholder: 'https://scrolledbrain.com' },
        ].map(({ label, value, set, placeholder }) => (
          <div key={label}>
            <label className="text-xs text-on-surface-variant font-label block mb-1">{label}</label>
            <input
              type="url"
              value={value}
              onChange={e => set(e.target.value)}
              placeholder={placeholder}
              className="pib-input text-sm w-full"
            />
          </div>
        ))}
      </div>

      <div className="pib-card p-4 space-y-3">
        <h2 className="text-sm font-label font-semibold text-on-surface">Kill Switch</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={killSwitch}
            onChange={e => setKillSwitch(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--color-accent-text)]"
          />
          <span className="text-sm text-on-surface">
            Take site offline immediately (returns 503, CDN bypassed)
          </span>
        </label>
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Feature Flags</h2>
        <p className="text-xs text-on-surface-variant">JSON object of key → boolean or string. Example: <code>{`{"cardStyle":"meme","showLeaderboard":true}`}</code></p>
        <textarea
          value={featureFlagsText}
          onChange={e => setFeatureFlagsText(e.target.value)}
          rows={6}
          className="pib-input text-xs font-mono w-full"
          spellCheck={false}
        />
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Custom Config</h2>
        <p className="text-xs text-on-surface-variant">Escape hatch for site-specific config. Any valid JSON object.</p>
        <textarea
          value={customConfigText}
          onChange={e => setCustomConfigText(e.target.value)}
          rows={6}
          className="pib-input text-xs font-mono w-full"
          spellCheck={false}
        />
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Integrations</h2>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Conversion Sequence ID</label>
          <input
            type="text"
            value={conversionSequenceId}
            onChange={e => setConversionSequenceId(e.target.value)}
            placeholder="seq_…"
            className="pib-input text-sm w-72"
          />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Creator Link Prefix</label>
          <input
            type="text"
            value={creatorLinkPrefix}
            onChange={e => setCreatorLinkPrefix(e.target.value)}
            placeholder="sb-"
            className="pib-input text-sm w-48"
          />
          <p className="text-xs text-on-surface-variant mt-1">Links with slugs starting with this prefix are attributed to this property.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 font-label">{error}</p>}
      {success && <p className="text-sm text-green-400 font-label">Saved.</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="pib-btn-primary text-sm font-label"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}
```

Then in the tab content section, replace:

```tsx
{activeTab === 'config'    && <PlaceholderTab label="Config editor" />}
```

with:

```tsx
{activeTab === 'config' && (
  <ConfigTab
    property={property}
    onSave={(updated) => setProperty(updated)}
  />
)}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/properties/[id]/page.tsx"
git commit -m "feat(properties): add Config tab with JSON editor for flags and runtime config"
```

---

## Task 11: Create Property Page (New)

**Files:**
- Create: `app/(admin)/admin/properties/new/page.tsx`

This page allows creation of a new property. On success it redirects to the detail page.

- [ ] **Step 1: Implement**

```tsx
// app/(admin)/admin/properties/new/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { PropertyType, PropertyStatus } from '@/lib/properties/types'

export default function NewPropertyPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [orgId, setOrgId] = useState('')
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [type, setType] = useState<PropertyType>('web')
  const [status, setStatus] = useState<PropertyStatus>('draft')

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then(r => r.json())
      .then(body => setOrgs(body.data ?? []))
      .catch(() => {})
  }, [])

  async function handleCreate() {
    if (!orgId) { setError('Select a client.'); return }
    if (!name.trim()) { setError('Name is required.'); return }
    if (!domain.trim()) { setError('Domain is required.'); return }

    setSaving(true); setError('')
    try {
      const res = await fetch('/api/v1/properties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId, name: name.trim(), domain: domain.trim(), type, status }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Creation failed')
      router.push(`/admin/properties/${body.data.id}`)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin/properties')} className="text-on-surface-variant hover:text-on-surface text-sm">
          ← Properties
        </button>
        <h1 className="text-xl font-headline font-bold text-on-surface">New Property</h1>
      </div>

      <div className="pib-card p-5 space-y-4">
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Client *</label>
          <select value={orgId} onChange={e => setOrgId(e.target.value)} className="pib-input text-sm w-full">
            <option value="">Select a client…</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Scrolled Brain" className="pib-input text-sm w-full" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Domain *</label>
          <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="scrolledbrain.com" className="pib-input text-sm w-full" />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-on-surface-variant font-label block mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as PropertyType)} className="pib-input text-sm w-full">
              <option value="web">Web</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
              <option value="universal">Universal</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-on-surface-variant font-label block mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as PropertyStatus)} className="pib-input text-sm w-full">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-400 font-label">{error}</p>}
        <button onClick={handleCreate} disabled={saving} className="pib-btn-primary text-sm font-label w-full">
          {saving ? 'Creating…' : 'Create Property'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/properties/new/page.tsx"
git commit -m "feat(properties): add new property creation page"
```

---

## Task 12: Firestore Indexes

Add the composite indexes needed for the properties queries.

- [ ] **Step 1: Check for existing index config file**

```bash
ls "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web/firestore.indexes.json" 2>/dev/null || echo "NOT_FOUND"
```

If the file exists, open it and append to the `indexes` array. If not, create it.

- [ ] **Step 2: Add indexes**

Add these indexes to `firestore.indexes.json` (create if missing, or merge into existing):

```json
{
  "indexes": [
    {
      "collectionGroup": "properties",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "orgId",     "order": "ASCENDING" },
        { "fieldPath": "deleted",   "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "properties",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "orgId",     "order": "ASCENDING" },
        { "fieldPath": "deleted",   "order": "ASCENDING" },
        { "fieldPath": "status",    "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "properties",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "orgId",     "order": "ASCENDING" },
        { "fieldPath": "deleted",   "order": "ASCENDING" },
        { "fieldPath": "type",      "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 3: Deploy indexes to Firebase**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
npx firebase deploy --only firestore:indexes --project partners-in-biz-85059
```

Expected: `Deploy complete!`

- [ ] **Step 4: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(properties): add Firestore composite indexes"
```

---

## Task 13: Firestore Security Rules

Add security rules for the `properties` collection. Properties are readable by admins and by anyone who knows the ingest key (enforced at the API layer — not directly via Firestore rules, since ingest key auth is server-side only).

- [ ] **Step 1: Open `firestore.rules`**

```bash
cat "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web/firestore.rules" | tail -30
```

- [ ] **Step 2: Add the properties rule block**

Find the last `match /` block in `firestore.rules` and add before the closing braces:

```
// Properties — managed via server-side API only
match /properties/{docId} {
  allow read, write: if false; // all access via Admin SDK in API routes
}
```

- [ ] **Step 3: Deploy rules**

```bash
npx firebase deploy --only firestore:rules --project partners-in-biz-85059
```

Expected: `Deploy complete!`

- [ ] **Step 4: Run full test suite to confirm nothing is broken**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "feat(properties): add Firestore security rules"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `properties` collection with all spec fields
- [x] `ingestKey` generated with `crypto.randomBytes(32).toString('hex')` — 64 char hex
- [x] `GET /api/v1/properties` (admin, filter by orgId/status/type)
- [x] `POST /api/v1/properties` (admin, returns ingestKey in 201 response)
- [x] `GET /api/v1/properties/:id` (admin)
- [x] `PUT /api/v1/properties/:id` (admin)
- [x] `DELETE /api/v1/properties/:id` (admin, soft delete)
- [x] `POST /api/v1/properties/:id/rotate-ingest-key` (admin)
- [x] `GET /api/v1/properties/:id/config` (public, ingest-key auth, 60s CDN cache, kill switch → 503)
- [x] Config does not leak `ingestKey`, `orgId`, or `deleted` fields
- [x] Admin UI: Properties list page (filter by org, click-through to detail)
- [x] Admin UI: Property detail with Overview / Config / Keys tabs
- [x] Admin UI: New property creation form
- [x] Placeholder tabs for Sequences, Creators, Analytics (Module 2)
- [x] Sidebar nav entry added
- [x] Composite Firestore indexes
- [x] Firestore security rules

**Not in this PR (deferred to PR 2 or later):**
- Sequences tab — needs sequences API endpoint to link against
- Creators tab — needs links API filtered by prefix
- Analytics tab — needs Module 1 (Analytics)
- Webhook events (`property.created`, `property.updated`) — can be added once webhook event types are expanded
