# Phase 4 — Sequences Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-step email sequence (drip campaign) module — define sequences with ordered steps, enroll contacts, and automatically send each step via cron.

**Architecture:** Sequences are Firestore documents with an embedded `steps` array. Enrollments are separate documents tracking each contact's progress through a sequence. A cron job fires every hour, finds due enrollments, sends via Resend, logs activity, and advances the step counter.

**Tech Stack:** Next.js 16 App Router, Firebase Admin SDK (Firestore), Resend v6, TypeScript, Jest + ts-jest

---

### Task 1: Types

**Files:**
- Create: `lib/sequences/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// lib/sequences/types.ts
import type { Timestamp } from 'firebase-admin/firestore'

export interface SequenceStep {
  stepNumber: number
  delayDays: number
  subject: string
  bodyHtml: string
  bodyText: string
}

export type SequenceStatus = 'draft' | 'active' | 'paused'

export interface Sequence {
  id: string
  name: string
  description: string
  status: SequenceStatus
  steps: SequenceStep[]
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  deleted?: boolean
}

export type SequenceInput = Omit<Sequence, 'id' | 'createdAt' | 'updatedAt'>

export type EnrollmentStatus = 'active' | 'completed' | 'paused' | 'exited'
export type ExitReason = 'replied' | 'unsubscribed' | 'manual' | 'completed'

export interface SequenceEnrollment {
  id: string
  sequenceId: string
  contactId: string
  status: EnrollmentStatus
  currentStep: number        // 0-based index into sequence.steps
  enrolledAt: Timestamp | null
  nextSendAt: Timestamp | null
  exitReason?: ExitReason
  completedAt?: Timestamp | null
  deleted?: boolean
}

export type EnrollmentInput = Omit<SequenceEnrollment, 'id' | 'enrolledAt'>
```

- [ ] **Step 2: Commit**

```bash
git add lib/sequences/types.ts
git commit -m "feat: add sequence + enrollment TypeScript types"
```

---

### Task 2: Sequences List + Create API

**Files:**
- Create: `app/api/v1/sequences/route.ts`
- Create: `__tests__/api/sequences.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/sequences.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()
const mockOffset = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: mockCollection,
  },
}))

jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'

const authHeader = { Authorization: 'Bearer test-key' }

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, offset: mockOffset, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockOffset.mockReturnValue(query)
  mockCollection.mockReturnValue({ ...query, add: mockAdd })
})

describe('GET /api/v1/sequences', () => {
  it('returns list of sequences', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'seq1', data: () => ({ name: 'Welcome', status: 'active', steps: [] }) }],
    })
    const { GET } = await import('@/app/api/v1/sequences/route')
    const req = new NextRequest('http://localhost/api/v1/sequences', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('seq1')
  })
})

describe('POST /api/v1/sequences', () => {
  it('creates a sequence', async () => {
    mockAdd.mockResolvedValue({ id: 'new-seq' })
    const { POST } = await import('@/app/api/v1/sequences/route')
    const req = new NextRequest('http://localhost/api/v1/sequences', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Onboarding', description: '', status: 'draft', steps: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('new-seq')
  })

  it('rejects missing name', async () => {
    const { POST } = await import('@/app/api/v1/sequences/route')
    const req = new NextRequest('http://localhost/api/v1/sequences', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/peetstander/.config/superpowers/worktrees/partnersinbiz-web/phase1-foundation
npx jest __tests__/api/sequences.test.ts --no-coverage 2>&1 | tail -20
```
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement the route**

```typescript
// app/api/v1/sequences/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const page = parseInt(searchParams.get('page') ?? '1')

  let query = (adminDb.collection('sequences') as any).where('deleted', '!=', true)
  if (status) query = query.where('status', '==', status)
  query = query.orderBy('createdAt', 'desc').limit(limit).offset((page - 1) * limit)

  const snap = await query.get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.name) return apiError('name is required', 400)

  const ref = await adminDb.collection('sequences').add({
    name: body.name,
    description: body.description ?? '',
    status: body.status ?? 'draft',
    steps: body.steps ?? [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  })
  return apiSuccess({ id: ref.id, ...body }, 201)
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/sequences.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/sequences/route.ts __tests__/api/sequences.test.ts
git commit -m "feat: add sequences list + create API with tests"
```

---

### Task 3: Sequences Detail API (GET/PUT/DELETE)

**Files:**
- Create: `app/api/v1/sequences/[id]/route.ts`
- Create: `__tests__/api/sequences-id.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/sequences-id.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'
const authHeader = { Authorization: 'Bearer test-key' }
const params = { params: Promise.resolve({ id: 'seq1' }) }

beforeEach(() => {
  jest.clearAllMocks()
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('GET /api/v1/sequences/[id]', () => {
  it('returns a sequence', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'seq1', data: () => ({ name: 'Welcome', deleted: false }) })
    const { GET } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1', { headers: authHeader })
    const res = await GET(req, params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('seq1')
  })

  it('returns 404 for missing sequence', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const { GET } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/none', { headers: authHeader })
    const res = await GET(req, params)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/v1/sequences/[id]', () => {
  it('updates a sequence', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'seq1', data: () => ({ name: 'Old', deleted: false }) })
    mockUpdate.mockResolvedValue({})
    const { PUT } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1', {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New' }),
    })
    const res = await PUT(req, params)
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/v1/sequences/[id]', () => {
  it('soft-deletes a sequence', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'seq1', data: () => ({ name: 'Welcome', deleted: false }) })
    mockUpdate.mockResolvedValue({})
    const { DELETE } = await import('@/app/api/v1/sequences/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1', { method: 'DELETE', headers: authHeader })
    const res = await DELETE(req, params)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/sequences-id.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement the route**

```typescript
// app/api/v1/sequences/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  return apiSuccess({ id: snap.id, ...snap.data() })
})

export const PUT = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const body = await req.json().catch(() => ({}))
  await adminDb.collection('sequences').doc(id).update({ ...body, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id, ...body })
})

export const DELETE = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  await adminDb.collection('sequences').doc(id).update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/sequences-id.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/sequences/[id]/route.ts __tests__/api/sequences-id.test.ts
git commit -m "feat: add sequences detail GET/PUT/DELETE with tests"
```

---

### Task 4: Enroll + Enrollments API

**Files:**
- Create: `app/api/v1/sequences/[id]/enroll/route.ts`
- Create: `app/api/v1/sequence-enrollments/route.ts`
- Create: `app/api/v1/sequence-enrollments/[id]/route.ts`
- Create: `__tests__/api/sequence-enrollments.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/sequence-enrollments.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
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
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockImplementation((name: string) => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockGet,
    add: mockAdd,
    doc: mockDoc,
  }))
})

describe('POST /api/v1/sequences/[id]/enroll', () => {
  it('enrolls contacts into an active sequence', async () => {
    const seqData = { name: 'Welcome', status: 'active', steps: [{ stepNumber: 1, delayDays: 0, subject: 'Hi', bodyHtml: '<p>Hi</p>', bodyText: 'Hi' }], deleted: false }
    const contactData = { name: 'Alice', email: 'alice@example.com', deleted: false }

    mockGet.mockImplementation(() => ({
      exists: true,
      id: 'seq1',
      data: () => seqData,
    }))
    // second get for contact
    mockGet.mockImplementationOnce(() => ({ exists: true, id: 'seq1', data: () => seqData }))
      .mockImplementationOnce(() => ({ exists: true, id: 'c1', data: () => contactData }))
    mockAdd.mockResolvedValue({ id: 'enroll1' })

    const { POST } = await import('@/app/api/v1/sequences/[id]/enroll/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1/enroll', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: ['c1'] }),
    })
    const params = { params: Promise.resolve({ id: 'seq1' }) }
    const res = await POST(req, params)
    expect(res.status).toBe(201)
  })

  it('rejects enrollment into draft sequence', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'seq1', data: () => ({ status: 'draft', deleted: false }) })
    const { POST } = await import('@/app/api/v1/sequences/[id]/enroll/route')
    const req = new NextRequest('http://localhost/api/v1/sequences/seq1/enroll', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: ['c1'] }),
    })
    const params = { params: Promise.resolve({ id: 'seq1' }) }
    const res = await POST(req, params)
    expect(res.status).toBe(422)
  })
})

describe('GET /api/v1/sequence-enrollments', () => {
  it('returns enrollments list', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'e1', data: () => ({ sequenceId: 'seq1', contactId: 'c1', status: 'active' }) }],
    })
    const { GET } = await import('@/app/api/v1/sequence-enrollments/route')
    const req = new NextRequest('http://localhost/api/v1/sequence-enrollments', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
  })
})

describe('DELETE /api/v1/sequence-enrollments/[id]', () => {
  it('exits an enrollment', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'e1', data: () => ({ status: 'active', deleted: false }) })
    mockUpdate.mockResolvedValue({})
    const { DELETE } = await import('@/app/api/v1/sequence-enrollments/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/sequence-enrollments/e1', { method: 'DELETE', headers: authHeader })
    const params = { params: Promise.resolve({ id: 'e1' }) }
    const res = await DELETE(req, params)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/sequence-enrollments.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement enroll route**

```typescript
// app/api/v1/sequences/[id]/enroll/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => null)
  if (!body?.contactIds?.length) return apiError('contactIds required', 400)

  const seqSnap = await adminDb.collection('sequences').doc(id).get()
  if (!seqSnap.exists || seqSnap.data()?.deleted) return apiError('Sequence not found', 404)
  const seq = seqSnap.data()!
  if (seq.status !== 'active') return apiError('Sequence must be active to enroll', 422)

  const firstStep = seq.steps?.[0]
  const delayMs = (firstStep?.delayDays ?? 0) * 24 * 60 * 60 * 1000
  const nextSendAt = Timestamp.fromDate(new Date(Date.now() + delayMs))

  const enrolled: string[] = []
  for (const contactId of body.contactIds as string[]) {
    const contactSnap = await adminDb.collection('contacts').doc(contactId).get()
    if (!contactSnap.exists || contactSnap.data()?.deleted) continue

    const ref = await adminDb.collection('sequence_enrollments').add({
      sequenceId: id,
      contactId,
      status: 'active',
      currentStep: 0,
      enrolledAt: FieldValue.serverTimestamp(),
      nextSendAt,
      deleted: false,
    })

    await adminDb.collection('activities').add({
      contactId,
      type: 'sequence_enrolled',
      note: `Enrolled in sequence: ${seq.name}`,
      createdAt: FieldValue.serverTimestamp(),
    })

    enrolled.push(ref.id)
  }

  return apiSuccess({ enrolled }, 201)
})
```

- [ ] **Step 4: Implement enrollments list route**

```typescript
// app/api/v1/sequence-enrollments/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const sequenceId = searchParams.get('sequenceId')
  const contactId = searchParams.get('contactId')
  const status = searchParams.get('status')

  let query = (adminDb.collection('sequence_enrollments') as any).where('deleted', '!=', true)
  if (sequenceId) query = query.where('sequenceId', '==', sequenceId)
  if (contactId) query = query.where('contactId', '==', contactId)
  if (status) query = query.where('status', '==', status)
  query = query.orderBy('enrolledAt', 'desc')

  const snap = await query.get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})
```

- [ ] **Step 5: Implement enrollment detail route**

```typescript
// app/api/v1/sequence-enrollments/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const DELETE = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequence_enrollments').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  await adminDb.collection('sequence_enrollments').doc(id).update({
    status: 'exited',
    exitReason: 'manual',
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest __tests__/api/sequence-enrollments.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 4 passing

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/sequences/[id]/enroll/route.ts app/api/v1/sequence-enrollments/route.ts app/api/v1/sequence-enrollments/[id]/route.ts __tests__/api/sequence-enrollments.test.ts
git commit -m "feat: add sequence enrollment routes with tests"
```

---

### Task 5: Cron — Process Due Sequence Steps

**Files:**
- Modify: `app/api/cron/sequences/route.ts` (replace stub with real implementation)
- Create: `__tests__/api/cron-sequences.test.ts`

- [ ] **Step 1: Check if the file already exists**

```bash
cat app/api/cron/sequences/route.ts
```

- [ ] **Step 2: Write failing tests**

```typescript
// __tests__/api/cron-sequences.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockResendSend = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/email/resend', () => ({
  getResendClient: jest.fn(() => ({ emails: { send: mockResendSend } })),
  FROM_ADDRESS: 'peet@partnersinbiz.online',
}))

process.env.CRON_SECRET = 'cron-secret'

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockImplementation(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockGet,
    add: mockAdd,
    doc: mockDoc,
  }))
})

describe('GET /api/cron/sequences', () => {
  it('rejects missing CRON_SECRET', async () => {
    const { GET } = await import('@/app/api/cron/sequences/route')
    const req = new NextRequest('http://localhost/api/cron/sequences')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('processes due enrollments and sends emails', async () => {
    const dueEnrollment = {
      id: 'e1',
      data: () => ({
        sequenceId: 'seq1',
        contactId: 'c1',
        currentStep: 0,
        status: 'active',
        nextSendAt: { toDate: () => new Date(Date.now() - 1000) },
      }),
    }
    const seqData = {
      name: 'Welcome',
      steps: [
        { stepNumber: 1, delayDays: 0, subject: 'Step 1', bodyHtml: '<p>Hello</p>', bodyText: 'Hello' },
        { stepNumber: 2, delayDays: 3, subject: 'Step 2', bodyHtml: '<p>Follow</p>', bodyText: 'Follow' },
      ],
    }
    const contactData = { name: 'Alice', email: 'alice@example.com' }

    mockGet
      .mockResolvedValueOnce({ docs: [dueEnrollment] })          // enrollments query
      .mockResolvedValueOnce({ exists: true, data: () => seqData })  // sequence fetch
      .mockResolvedValueOnce({ exists: true, data: () => contactData }) // contact fetch

    mockResendSend.mockResolvedValue({ data: { id: 'resend-1' }, error: null })
    mockAdd.mockResolvedValue({ id: 'email-doc-1' })
    mockUpdate.mockResolvedValue({})

    const { GET } = await import('@/app/api/cron/sequences/route')
    const req = new NextRequest('http://localhost/api/cron/sequences', {
      headers: { Authorization: 'Bearer cron-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.processed).toBe(1)
    expect(mockResendSend).toHaveBeenCalledTimes(1)
  })

  it('marks enrollment completed when on last step', async () => {
    const dueEnrollment = {
      id: 'e1',
      data: () => ({
        sequenceId: 'seq1',
        contactId: 'c1',
        currentStep: 0,   // only one step (index 0)
        status: 'active',
        nextSendAt: { toDate: () => new Date(Date.now() - 1000) },
      }),
    }
    const seqData = {
      name: 'Welcome',
      steps: [{ stepNumber: 1, delayDays: 0, subject: 'Only Step', bodyHtml: '<p>Done</p>', bodyText: 'Done' }],
    }
    const contactData = { name: 'Bob', email: 'bob@example.com' }

    mockGet
      .mockResolvedValueOnce({ docs: [dueEnrollment] })
      .mockResolvedValueOnce({ exists: true, data: () => seqData })
      .mockResolvedValueOnce({ exists: true, data: () => contactData })

    mockResendSend.mockResolvedValue({ data: { id: 'r2' }, error: null })
    mockAdd.mockResolvedValue({ id: 'email-doc-2' })
    mockUpdate.mockResolvedValue({})

    const { GET } = await import('@/app/api/cron/sequences/route')
    const req = new NextRequest('http://localhost/api/cron/sequences', {
      headers: { Authorization: 'Bearer cron-secret' },
    })
    await GET(req)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest __tests__/api/cron-sequences.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 4: Implement the cron route**

```typescript
// app/api/cron/sequences/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getResendClient, FROM_ADDRESS } from '@/lib/email/resend'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)

  const now = Timestamp.now()
  const snap = await (adminDb.collection('sequence_enrollments') as any)
    .where('status', '==', 'active')
    .where('nextSendAt', '<=', now)
    .get()

  let processed = 0
  const resend = getResendClient()

  for (const enrollDoc of snap.docs) {
    const enrollment = enrollDoc.data()

    const seqSnap = await adminDb.collection('sequences').doc(enrollment.sequenceId).get()
    if (!seqSnap.exists) continue
    const seq = seqSnap.data()!
    const steps = seq.steps ?? []
    const step = steps[enrollment.currentStep]
    if (!step) continue

    const contactSnap = await adminDb.collection('contacts').doc(enrollment.contactId).get()
    if (!contactSnap.exists) continue
    const contact = contactSnap.data()!

    // Send via Resend
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: contact.email,
      subject: step.subject,
      html: step.bodyHtml,
      text: step.bodyText,
    })

    // Create email doc
    const emailRef = await adminDb.collection('emails').add({
      direction: 'outbound',
      contactId: enrollment.contactId,
      resendId: data?.id ?? '',
      from: FROM_ADDRESS,
      to: contact.email,
      cc: [],
      subject: step.subject,
      bodyHtml: step.bodyHtml,
      bodyText: step.bodyText,
      status: error ? 'failed' : 'sent',
      scheduledFor: null,
      sentAt: error ? null : FieldValue.serverTimestamp(),
      openedAt: null,
      clickedAt: null,
      sequenceId: enrollment.sequenceId,
      sequenceStep: enrollment.currentStep,
      createdAt: FieldValue.serverTimestamp(),
    })

    // Log activity
    await adminDb.collection('activities').add({
      contactId: enrollment.contactId,
      type: 'email_sent',
      note: `Sequence step ${enrollment.currentStep + 1}: ${step.subject}`,
      emailId: emailRef.id,
      createdAt: FieldValue.serverTimestamp(),
    })

    const nextStep = enrollment.currentStep + 1
    const isLast = nextStep >= steps.length

    if (isLast) {
      await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
        status: 'completed',
        exitReason: 'completed',
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      const nextDelayMs = steps[nextStep].delayDays * 24 * 60 * 60 * 1000
      const nextSendAt = Timestamp.fromDate(new Date(Date.now() + nextDelayMs))
      await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
        currentStep: nextStep,
        nextSendAt,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    processed++
  }

  return apiSuccess({ processed })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest __tests__/api/cron-sequences.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 3 passing

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/sequences/route.ts __tests__/api/cron-sequences.test.ts
git commit -m "feat: implement sequences cron processor with tests"
```

---

### Task 6: Sequences List UI Page

**Files:**
- Create: `app/(admin)/admin/sequences/page.tsx`

- [ ] **Step 1: Implement the page**

```typescript
// app/(admin)/admin/sequences/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Sequence } from '@/lib/sequences/types'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-surface-container text-on-surface-variant',
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    fetch('/api/v1/sequences')
      .then((r) => r.json())
      .then((b) => setSequences(b.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function createSequence() {
    if (!newName.trim()) return
    const res = await fetch('/api/v1/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: '', status: 'draft', steps: [] }),
    })
    const body = await res.json()
    if (res.ok) {
      setSequences((prev) => [body.data, ...prev])
      setNewName('')
      setCreating(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-on-surface">Email Sequences</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium"
        >
          New Sequence
        </button>
      </div>

      {creating && (
        <div className="mb-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Sequence name"
            className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            onKeyDown={(e) => e.key === 'Enter' && createSequence()}
            autoFocus
          />
          <button onClick={createSequence} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">
            Create
          </button>
          <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-sm">
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">No sequences yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {sequences.map((seq) => (
            <Link
              key={seq.id}
              href={`/admin/sequences/${seq.id}`}
              className="flex items-center justify-between p-4 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
            >
              <div>
                <p className="font-medium text-on-surface">{seq.name}</p>
                {seq.description && <p className="text-sm text-on-surface-variant mt-0.5">{seq.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-on-surface-variant">{seq.steps?.length ?? 0} steps</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[seq.status] ?? ''}`}>
                  {seq.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(admin)/admin/sequences/page.tsx
git commit -m "feat: add sequences list UI page"
```

---

### Task 7: Sequence Detail + Step Editor UI

**Files:**
- Create: `components/admin/sequences/StepEditor.tsx`
- Create: `app/(admin)/admin/sequences/[id]/page.tsx`

- [ ] **Step 1: Implement StepEditor component**

```typescript
// components/admin/sequences/StepEditor.tsx
'use client'

import { useState } from 'react'
import type { SequenceStep } from '@/lib/sequences/types'

interface Props {
  steps: SequenceStep[]
  onChange: (steps: SequenceStep[]) => void
}

const EMPTY_STEP: Omit<SequenceStep, 'stepNumber'> = {
  delayDays: 1,
  subject: '',
  bodyHtml: '',
  bodyText: '',
}

export default function StepEditor({ steps, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)

  function addStep() {
    const next: SequenceStep = { ...EMPTY_STEP, stepNumber: steps.length + 1 }
    onChange([...steps, next])
    setExpanded(steps.length)
  }

  function updateStep(index: number, field: keyof SequenceStep, value: string | number) {
    const updated = steps.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    onChange(updated)
  }

  function removeStep(index: number) {
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, stepNumber: i + 1 }))
    onChange(updated)
    if (expanded === index) setExpanded(null)
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="rounded-xl border border-outline-variant overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-container text-left"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className="text-sm font-medium text-on-surface">
              Step {step.stepNumber}: {step.subject || '(no subject)'}
            </span>
            <span className="text-xs text-on-surface-variant">
              {step.delayDays === 0 ? 'Immediately' : `+${step.delayDays}d`}
            </span>
          </button>
          {expanded === i && (
            <div className="p-4 bg-surface space-y-3 border-t border-outline-variant">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Subject</label>
                  <input
                    value={step.subject}
                    onChange={(e) => updateStep(i, 'subject', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Delay (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={step.delayDays}
                    onChange={(e) => updateStep(i, 'delayDays', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Body (plain text)</label>
                <textarea
                  value={step.bodyText}
                  onChange={(e) => {
                    updateStep(i, 'bodyText', e.target.value)
                    updateStep(i, 'bodyHtml', `<p>${e.target.value.replace(/\n/g, '</p><p>')}</p>`)
                  }}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm font-mono"
                />
              </div>
              <button
                onClick={() => removeStep(i)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove step
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        onClick={addStep}
        className="w-full py-2 rounded-xl border border-dashed border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
      >
        + Add step
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Implement sequence detail page**

```typescript
// app/(admin)/admin/sequences/[id]/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import StepEditor from '@/components/admin/sequences/StepEditor'
import type { Sequence, SequenceStep } from '@/lib/sequences/types'

const STATUS_OPTIONS = ['draft', 'active', 'paused'] as const

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [seq, setSeq] = useState<Sequence | null>(null)
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enrollContactId, setEnrollContactId] = useState('')

  useEffect(() => {
    params.then((p) => {
      setId(p.id)
      fetch(`/api/v1/sequences/${p.id}`)
        .then((r) => r.json())
        .then((b) => {
          setSeq(b.data)
          setSteps(b.data?.steps ?? [])
        })
        .finally(() => setLoading(false))
    })
  }, [params])

  async function save() {
    if (!id || !seq) return
    setSaving(true)
    await fetch(`/api/v1/sequences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: seq.name, description: seq.description, status: seq.status, steps }),
    })
    setSaving(false)
  }

  async function enroll() {
    if (!id || !enrollContactId.trim()) return
    await fetch(`/api/v1/sequences/${id}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: [enrollContactId.trim()] }),
    })
    setEnrollContactId('')
  }

  async function deleteSequence() {
    if (!id || !confirm('Delete this sequence?')) return
    await fetch(`/api/v1/sequences/${id}`, { method: 'DELETE' })
    router.push('/admin/sequences')
  }

  if (loading) return <div className="p-6 animate-pulse h-40 bg-surface-container rounded-xl" />
  if (!seq) return <div className="p-6 text-on-surface-variant">Sequence not found.</div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/admin/sequences')} className="text-sm text-on-surface-variant hover:underline">
          ← Sequences
        </button>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={deleteSequence} className="px-4 py-2 rounded-lg bg-surface-container text-red-600 text-sm font-medium">
            Delete
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <input
          value={seq.name}
          onChange={(e) => setSeq({ ...seq, name: e.target.value })}
          className="w-full text-xl font-semibold bg-transparent border-b border-outline-variant text-on-surface outline-none pb-1"
        />
        <input
          value={seq.description}
          onChange={(e) => setSeq({ ...seq, description: e.target.value })}
          placeholder="Description (optional)"
          className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
        />
        <select
          value={seq.status}
          onChange={(e) => setSeq({ ...seq, status: e.target.value as Sequence['status'] })}
          className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Steps</h2>
        <StepEditor steps={steps} onChange={setSteps} />
      </div>

      {seq.status === 'active' && (
        <div>
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Enroll a contact</h2>
          <div className="flex gap-2">
            <input
              value={enrollContactId}
              onChange={(e) => setEnrollContactId(e.target.value)}
              placeholder="Contact ID"
              className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            />
            <button onClick={enroll} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">
              Enroll
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/sequences/StepEditor.tsx app/(admin)/admin/sequences/[id]/page.tsx
git commit -m "feat: add sequence detail page with step editor UI"
```

---

### Task 8: Full Test Suite + Build Check

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```
Expected: All suites passing

- [ ] **Step 2: Run production build**

```bash
npx next build 2>&1 | tail -30
```
Expected: ✓ compiled successfully

- [ ] **Step 3: Commit if needed (only if there were fixes)**

```bash
git add -A
git commit -m "fix: resolve any test or build issues in Phase 4"
```
