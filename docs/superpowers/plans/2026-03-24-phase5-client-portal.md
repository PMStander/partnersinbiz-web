# Phase 5 — Client Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the client portal with secure session-cookie API routes, an enquiry detail page, a client messaging system, and a portal nav layout.

**Architecture:** A new `withPortalAuth` middleware verifies Firebase session cookies server-side (using Admin SDK), extracts `uid`, and passes it to handlers. Portal API routes use this instead of `AI_API_KEY`. UI pages use the existing `onAuthStateChanged` pattern to call these routes via fetch (the `__session` cookie is sent automatically).

**Tech Stack:** Next.js 16 App Router, Firebase Admin SDK (Auth + Firestore), TypeScript, Jest + ts-jest

---

### Task 1: Portal Auth Middleware

**Files:**
- Create: `lib/auth/portal-middleware.ts`
- Create: `__tests__/api/portal-middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/portal-middleware.test.ts
import { NextRequest } from 'next/server'

const mockVerifySessionCookie = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifySessionCookie: mockVerifySessionCookie },
}))

beforeEach(() => jest.clearAllMocks())

describe('withPortalAuth', () => {
  it('returns 401 when no session cookie', async () => {
    const { withPortalAuth } = await import('@/lib/auth/portal-middleware')
    const handler = jest.fn()
    const wrapped = withPortalAuth(handler)
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries')
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler with uid on valid session', async () => {
    mockVerifySessionCookie.mockResolvedValue({ uid: 'user-1' })
    const { withPortalAuth } = await import('@/lib/auth/portal-middleware')
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const wrapped = withPortalAuth(handler)
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries', {
      headers: { Cookie: '__session=valid-cookie' },
    })
    const res = await wrapped(req)
    expect(mockVerifySessionCookie).toHaveBeenCalledWith('valid-cookie', true)
    expect(handler).toHaveBeenCalledWith(req, 'user-1')
    expect(res.status).toBe(200)
  })

  it('returns 401 when session cookie is invalid', async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error('invalid'))
    const { withPortalAuth } = await import('@/lib/auth/portal-middleware')
    const handler = jest.fn()
    const wrapped = withPortalAuth(handler)
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries', {
      headers: { Cookie: '__session=bad-cookie' },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/portal-middleware.test.ts --no-coverage 2>&1 | tail -15
```

- [ ] **Step 3: Implement the middleware**

```typescript
// lib/auth/portal-middleware.ts
import { NextRequest } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'
import { apiError } from '@/lib/api/response'

type PortalHandler = (req: NextRequest, uid: string, ...args: any[]) => Promise<Response>

export function withPortalAuth(handler: PortalHandler) {
  return async (req: NextRequest, ...args: any[]): Promise<Response> => {
    const sessionCookie = req.cookies.get('__session')?.value
    if (!sessionCookie) return apiError('Unauthorized', 401)
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
      return handler(req, decoded.uid, ...args)
    } catch {
      return apiError('Unauthorized', 401)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/api/portal-middleware.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add lib/auth/portal-middleware.ts __tests__/api/portal-middleware.test.ts
git commit -m "feat: add portal session-cookie auth middleware with tests"
```

---

### Task 2: Portal Enquiries API

**Files:**
- Create: `app/api/v1/portal/enquiries/route.ts`
- Create: `app/api/v1/portal/enquiries/[id]/route.ts`
- Create: `__tests__/api/portal-enquiries.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/portal-enquiries.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
  adminAuth: { verifySessionCookie: jest.fn().mockResolvedValue({ uid: 'user-1' }) },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuth: (handler: Function) => (req: NextRequest) => handler(req, 'user-1'),
}))

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockDoc.mockReturnValue({ get: mockGet })
  mockCollection.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, doc: mockDoc })
})

describe('GET /api/v1/portal/enquiries', () => {
  it('returns enquiries for authenticated user', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'enq1', data: () => ({ projectType: 'web', status: 'active', userId: 'user-1' }) }],
    })
    const { GET } = await import('@/app/api/v1/portal/enquiries/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('enq1')
  })
})

describe('GET /api/v1/portal/enquiries/[id]', () => {
  it('returns enquiry owned by user', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'enq1',
      data: () => ({ projectType: 'web', status: 'active', userId: 'user-1' }),
    })
    const { GET } = await import('@/app/api/v1/portal/enquiries/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries/enq1', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req, { params: Promise.resolve({ id: 'enq1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('enq1')
  })

  it('returns 403 for enquiry owned by another user', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'enq2',
      data: () => ({ projectType: 'web', status: 'active', userId: 'other-user' }),
    })
    const { GET } = await import('@/app/api/v1/portal/enquiries/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries/enq2', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req, { params: Promise.resolve({ id: 'enq2' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 for missing enquiry', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const { GET } = await import('@/app/api/v1/portal/enquiries/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries/none', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req, { params: Promise.resolve({ id: 'none' }) })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/portal-enquiries.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement enquiries list route**

```typescript
// app/api/v1/portal/enquiries/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withPortalAuth(async (req: NextRequest, uid: string) => {
  const snap = await (adminDb.collection('enquiries') as any)
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})
```

- [ ] **Step 4: Implement enquiry detail route**

```typescript
// app/api/v1/portal/enquiries/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withPortalAuth(async (req: NextRequest, uid: string, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('enquiries').doc(id).get()
  if (!snap.exists) return apiError('Not found', 404)
  const data = snap.data()!
  if (data.userId !== uid) return apiError('Forbidden', 403)
  return apiSuccess({ id: snap.id, ...data })
}) as any
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest __tests__/api/portal-enquiries.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 4 passing

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/portal/enquiries/route.ts "app/api/v1/portal/enquiries/[id]/route.ts" __tests__/api/portal-enquiries.test.ts
git commit -m "feat: add portal enquiries API (list + detail) with ownership check"
```

---

### Task 3: Portal Messages API

**Files:**
- Create: `app/api/v1/portal/messages/route.ts`
- Create: `__tests__/api/portal-messages.test.ts`

Clients can post messages (questions/updates) tied to an enquiry. Admins see these in CRM activities.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/portal-messages.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
  adminAuth: { verifySessionCookie: jest.fn().mockResolvedValue({ uid: 'user-1' }) },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuth: (handler: Function) => (req: NextRequest) => handler(req, 'user-1'),
}))

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockDoc.mockReturnValue({ get: mockGet })
  mockCollection.mockImplementation(() => ({ where: mockWhere, orderBy: mockOrderBy, doc: mockDoc, add: mockAdd }))
})

describe('GET /api/v1/portal/messages', () => {
  it('returns messages for user enquiry', async () => {
    // first get: verify enquiry ownership
    mockGet
      .mockResolvedValueOnce({ exists: true, id: 'enq1', data: () => ({ userId: 'user-1' }) })
      .mockResolvedValueOnce({
        docs: [{ id: 'msg1', data: () => ({ text: 'Hello', enquiryId: 'enq1', createdAt: null }) }],
      })
    const { GET } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages?enquiryId=enq1', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
  })

  it('returns 400 when no enquiryId provided', async () => {
    const { GET } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 for enquiry owned by another user', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'enq1', data: () => ({ userId: 'other-user' }) })
    const { GET } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages?enquiryId=enq1', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/v1/portal/messages', () => {
  it('creates a message and activity', async () => {
    mockGet.mockResolvedValue({ exists: true, id: 'enq1', data: () => ({ userId: 'user-1', name: 'Alice' }) })
    mockAdd.mockResolvedValue({ id: 'msg-new' })
    const { POST } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages', {
      method: 'POST',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId: 'enq1', text: 'Can we schedule a call?' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockAdd).toHaveBeenCalledTimes(2) // message + activity
  })

  it('returns 400 when text is missing', async () => {
    const { POST } = await import('@/app/api/v1/portal/messages/route')
    const req = new NextRequest('http://localhost/api/v1/portal/messages', {
      method: 'POST',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId: 'enq1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/portal-messages.test.ts --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Implement the messages route**

```typescript
// app/api/v1/portal/messages/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export const GET = withPortalAuth(async (req: NextRequest, uid: string) => {
  const { searchParams } = new URL(req.url)
  const enquiryId = searchParams.get('enquiryId')
  if (!enquiryId) return apiError('enquiryId is required', 400)

  // Verify ownership
  const enqSnap = await adminDb.collection('enquiries').doc(enquiryId).get()
  if (!enqSnap.exists) return apiError('Not found', 404)
  if (enqSnap.data()!.userId !== uid) return apiError('Forbidden', 403)

  const snap = await (adminDb.collection('portal_messages') as any)
    .where('enquiryId', '==', enquiryId)
    .orderBy('createdAt', 'asc')
    .get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})

export const POST = withPortalAuth(async (req: NextRequest, uid: string) => {
  const body = await req.json().catch(() => null)
  if (!body?.enquiryId || !body?.text?.trim()) return apiError('enquiryId and text are required', 400)

  // Verify ownership
  const enqSnap = await adminDb.collection('enquiries').doc(body.enquiryId).get()
  if (!enqSnap.exists) return apiError('Not found', 404)
  if (enqSnap.data()!.userId !== uid) return apiError('Forbidden', 403)

  const enqData = enqSnap.data()!

  const msgRef = await adminDb.collection('portal_messages').add({
    enquiryId: body.enquiryId,
    uid,
    authorName: enqData.name ?? 'Client',
    direction: 'inbound',
    text: body.text.trim(),
    createdAt: FieldValue.serverTimestamp(),
  })

  // Log as CRM activity if there's a linked contactId
  if (enqData.contactId) {
    await adminDb.collection('activities').add({
      contactId: enqData.contactId,
      type: 'note',
      note: `Client message: ${body.text.trim()}`,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  return apiSuccess({ id: msgRef.id }, 201)
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/portal-messages.test.ts --no-coverage 2>&1 | tail -10
```
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/portal/messages/route.ts __tests__/api/portal-messages.test.ts
git commit -m "feat: add portal messages API (list + post) with enquiry ownership guard"
```

---

### Task 4: Enhanced Portal UI

**Files:**
- Modify: `app/(portal)/portal/dashboard/page.tsx` — add stats summary + links to detail
- Create: `app/(portal)/portal/enquiries/[id]/page.tsx` — detail with timeline + message thread
- Create: `components/portal/MessageThread.tsx` — reusable message thread component

- [ ] **Step 1: Create MessageThread component**

```typescript
// components/portal/MessageThread.tsx
'use client'

import { useState } from 'react'

interface Message {
  id: string
  text: string
  direction: 'inbound' | 'outbound'
  authorName: string
  createdAt: any
}

interface Props {
  messages: Message[]
  enquiryId: string
  onSent: (msg: Message) => void
}

export default function MessageThread({ messages, enquiryId, onSent }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (!text.trim()) return
    setSending(true)
    const res = await fetch('/api/v1/portal/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId, text: text.trim() }),
    })
    if (res.ok) {
      const body = await res.json()
      onSent({ id: body.data.id, text: text.trim(), direction: 'inbound', authorName: 'You', createdAt: null })
      setText('')
    }
    setSending(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-white/40 text-sm text-center py-6">No messages yet. Send us an update below.</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                msg.direction === 'inbound'
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.03] border border-white/10 text-white/80'
              }`}
            >
              <p className="text-xs font-medium mb-1 opacity-60">{msg.authorName}</p>
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Send a message or update…"
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder:text-white/30 outline-none focus:border-white/30"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40 transition-opacity"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create enquiry detail page**

```typescript
// app/(portal)/portal/enquiries/[id]/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import MessageThread from '@/components/portal/MessageThread'

const STATUS_LABELS: Record<string, string> = {
  new: 'Under Review',
  reviewing: 'In Discussion',
  active: 'In Progress',
  closed: 'Completed',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'border-white/20 text-white/50',
  reviewing: 'border-blue-400/40 text-blue-300',
  active: 'border-green-400/40 text-green-300',
  closed: 'border-white/10 text-white/30',
}

interface Message {
  id: string
  text: string
  direction: 'inbound' | 'outbound'
  authorName: string
  createdAt: any
}

export default function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [enquiry, setEnquiry] = useState<any | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  useEffect(() => {
    if (!id) return
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const [enqRes, msgRes] = await Promise.all([
        fetch(`/api/v1/portal/enquiries/${id}`),
        fetch(`/api/v1/portal/messages?enquiryId=${id}`),
      ])
      if (!enqRes.ok) { router.push('/portal/dashboard'); return }
      const enqBody = await enqRes.json()
      const msgBody = await msgRes.json()
      setEnquiry(enqBody.data)
      setMessages(msgBody.data ?? [])
      setLoading(false)
    })
  }, [id, router])

  if (loading) return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-3xl mx-auto animate-pulse space-y-4">
        <div className="h-8 w-48 bg-white/10 rounded-xl" />
        <div className="h-40 bg-white/5 rounded-2xl" />
      </div>
    </main>
  )

  if (!enquiry) return null

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <button
            onClick={() => router.push('/portal/dashboard')}
            className="text-white/40 hover:text-white text-sm transition-colors mb-6 block"
          >
            ← Back to projects
          </button>
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-headline text-3xl font-bold tracking-tighter">
              {enquiry.projectType?.toUpperCase() ?? 'Project'}
            </h1>
            <span className={`text-xs font-label uppercase tracking-widest border px-3 py-1 rounded-full ${STATUS_COLORS[enquiry.status] ?? 'border-white/20 text-white/40'}`}>
              {STATUS_LABELS[enquiry.status] ?? enquiry.status}
            </span>
          </div>
        </div>

        {/* Project Details */}
        <div className="glass-card p-6 space-y-3">
          <h2 className="text-sm font-label uppercase tracking-widest text-white/40">Project Brief</h2>
          <p className="text-white/80 text-sm leading-relaxed">{enquiry.details}</p>
          {enquiry.company && (
            <p className="text-xs text-white/40">Company: {enquiry.company}</p>
          )}
        </div>

        {/* Messages */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-label uppercase tracking-widest text-white/40">Messages</h2>
          <MessageThread
            messages={messages}
            enquiryId={enquiry.id}
            onSent={(msg) => setMessages((prev) => [...prev, msg])}
          />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Update portal dashboard to link to detail pages**

Replace the existing `app/(portal)/portal/dashboard/page.tsx` with:

```typescript
// app/(portal)/portal/dashboard/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { logout } from '@/lib/firebase/auth'

const STATUS_LABELS: Record<string, string> = {
  new: 'Under Review',
  reviewing: 'In Discussion',
  active: 'In Progress',
  closed: 'Completed',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'border-white/20 text-white/50',
  reviewing: 'border-blue-400/40 text-blue-300',
  active: 'border-green-400/40 text-green-300',
  closed: 'border-white/10 text-white/30',
}

export default function PortalDashboard() {
  const router = useRouter()
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const res = await fetch('/api/v1/portal/enquiries')
      const body = await res.json()
      setEnquiries(body.data ?? [])
      setLoading(false)
    })
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  const activeCount = enquiries.filter((e) => e.status === 'active').length
  const totalCount = enquiries.length

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="font-headline text-4xl font-bold tracking-tighter">Your Projects</h1>
          <button onClick={handleLogout} className="text-white/40 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>

        {/* Stats summary */}
        {!loading && totalCount > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="glass-card p-6 text-center">
              <p className="text-4xl font-headline font-bold tracking-tighter">{totalCount}</p>
              <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">Total Projects</p>
            </div>
            <div className="glass-card p-6 text-center">
              <p className="text-4xl font-headline font-bold tracking-tighter text-green-300">{activeCount}</p>
              <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">In Progress</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="glass-card p-8 animate-pulse h-28" />
            ))}
          </div>
        ) : enquiries.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-white/40 mb-6">No projects yet.</p>
            <a href="/start-a-project" className="text-white underline text-sm">Start a project →</a>
          </div>
        ) : (
          <div className="space-y-4">
            {enquiries.map((enq) => (
              <Link
                key={enq.id}
                href={`/portal/enquiries/${enq.id}`}
                className="glass-card p-8 flex justify-between items-start hover:bg-white/[0.05] transition-colors block"
              >
                <div>
                  <h3 className="font-headline text-xl font-bold tracking-tight mb-2">
                    {enq.projectType?.toUpperCase() ?? 'Project'}
                  </h3>
                  <p className="text-white/50 text-sm mb-0 line-clamp-2">{enq.details}</p>
                </div>
                <span className={`flex-shrink-0 ml-4 text-xs font-label uppercase tracking-widest border px-3 py-1 rounded-full ${STATUS_COLORS[enq.status] ?? 'border-white/20 text-white/40'}`}>
                  {STATUS_LABELS[enq.status] ?? enq.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Commit all UI changes**

```bash
git add components/portal/MessageThread.tsx "app/(portal)/portal/enquiries/[id]/page.tsx" "app/(portal)/portal/dashboard/page.tsx"
git commit -m "feat: enhance client portal with enquiry detail page and message thread"
```

---

### Task 5: Full Test Suite + Build Check

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

- [ ] **Step 3: Commit fixes if needed**

```bash
git add -A && git commit -m "fix: resolve Phase 5 test or build issues"
```
