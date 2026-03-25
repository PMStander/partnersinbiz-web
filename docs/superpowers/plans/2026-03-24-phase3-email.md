# Phase 3 — Email Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build email send/schedule/inbox functionality backed by Resend, with admin pages for composing and reading emails.

**Architecture:** API routes at `/api/v1/email/*` use the existing `withAuth('admin')` middleware. A Resend singleton in `lib/email/resend.ts` is the single integration point — all routes call `getResendClient()`. Firestore `emails/{id}` is the source of truth for all email state. Webhook events from Resend update status fields in-place. A Vercel cron at `/api/cron/emails` fires every 15 minutes to dispatch scheduled emails. The enquiry notification is wired directly into the existing `app/api/enquiries/route.ts` as a fire-and-forget side effect.

**Tech Stack:** Next.js 16 App Router · TypeScript · Firebase Admin SDK (Firestore) · Resend v6 (`resend@^6.9.4`) · Tailwind v4 · Jest (ts-jest, node env) · `withAuth` + `apiSuccess`/`apiError` from Phase 1

---

## Worktree

All work in: `/Users/peetstander/.config/superpowers/worktrees/partnersinbiz-web/phase1-foundation`
Run tests with PATH: `/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin`

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `lib/email/types.ts` | TypeScript interfaces for `Email`, `EmailInput`, `EmailStatus`, `EmailListParams` |
| `lib/email/resend.ts` | Resend singleton (`getResendClient()`), `FROM_ADDRESS` constant, plain-text-to-HTML helper |
| `app/api/v1/email/route.ts` | `GET` — list emails with filters (direction, status, contactId, limit, page) |
| `app/api/v1/email/send/route.ts` | `POST` — validate, write Firestore doc, call Resend, update status, log activity |
| `app/api/v1/email/schedule/route.ts` | `POST` — write email doc with `status: "scheduled"`, no send |
| `app/api/v1/email/[id]/route.ts` | `PUT` — update draft/scheduled email; `DELETE` — soft-delete |
| `app/api/v1/email/webhook/route.ts` | `POST` — public endpoint; maps Resend event types to Firestore status updates |
| `app/api/cron/emails/route.ts` | `GET` — CRON_SECRET-protected; queries scheduled emails due now, sends each via Resend |
| `components/admin/email/EmailList.tsx` | Left-pane folder tabs + scrollable email rows |
| `components/admin/email/EmailDetail.tsx` | Right-pane read view for a selected email |
| `components/admin/email/ComposeForm.tsx` | Controlled form: To, CC, Subject, Body textarea, send/schedule toggle |
| `app/(admin)/admin/email/page.tsx` | Split-pane inbox page — composes `EmailList` + `EmailDetail` |
| `app/(admin)/admin/email/compose/page.tsx` | Full-page compose using `ComposeForm` |

### Modified files

| File | Change |
|------|--------|
| `app/api/enquiries/route.ts` | Add fire-and-forget Resend notification to `peet@partnersinbiz.online` after enquiry save |
| `vercel.json` | Add `{ "path": "/api/cron/emails", "schedule": "*/15 * * * *" }` to `crons` array |

---

## Design Rules

Match existing tokens exactly. No new libraries.

```
Border:          border-outline-variant
Surfaces:        bg-surface-container
Text primary:    text-on-surface
Text muted:      text-on-surface-variant
Badges:          text-[10px] font-label uppercase tracking-widest border border-outline-variant px-2 py-0.5
Skeleton:        h-8 bg-surface-container animate-pulse
Button primary:  px-4 py-2 text-sm font-label text-black bg-on-surface hover:opacity-90
Button ghost:    text-sm font-label text-on-surface-variant border border-outline-variant hover:text-on-surface
Input:           bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-on-surface
Textarea:        same as input + resize-none
Empty state:     border border-outline-variant p-12 text-center with CTA link
```

All client pages: `'use client'` at top, `export const dynamic = 'force-dynamic'`

---

## Task 1: Email Types + Resend Client

**Files:**
- Create: `lib/email/types.ts`
- Create: `lib/email/resend.ts`

No tests — pure types + thin wrapper.

- [ ] **Step 1: Create `lib/email/types.ts`**

```typescript
// lib/email/types.ts
import type { Timestamp } from 'firebase-admin/firestore'

export type EmailDirection = 'outbound' | 'inbound'

export type EmailStatus =
  | 'draft'
  | 'scheduled'
  | 'sent'
  | 'failed'
  | 'opened'
  | 'clicked'

export interface Email {
  id: string
  direction: EmailDirection
  contactId: string        // "" if none linked
  resendId: string         // Resend email ID — populated after send, used for webhook lookup
  from: string
  to: string
  cc: string[]
  subject: string
  bodyHtml: string
  bodyText: string
  status: EmailStatus
  scheduledFor: Timestamp | null
  sentAt: Timestamp | null
  openedAt: Timestamp | null
  clickedAt: Timestamp | null
  sequenceId: string       // "" if not part of a sequence
  sequenceStep: number | null
  createdAt: Timestamp | null
  deleted?: boolean
}

export type EmailInput = Omit<Email, 'id' | 'createdAt' | 'resendId'>

export interface EmailListParams {
  direction?: EmailDirection
  status?: EmailStatus
  contactId?: string
  limit?: number
  page?: number
}
```

- [ ] **Step 2: Create `lib/email/resend.ts`**

```typescript
// lib/email/resend.ts
import { Resend } from 'resend'

export const FROM_ADDRESS = 'peet@partnersinbiz.online'

let client: Resend | null = null

/** Returns a singleton Resend client. Lazy-initialised so it is safe at build time. */
export function getResendClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}

/**
 * Wraps plain-text body lines in simple HTML paragraphs.
 * Used when bodyHtml is not explicitly provided by the caller.
 */
export function plainTextToHtml(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => `<p style="margin:0 0 8px">${l}</p>`)
    .join('')
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">${lines}</div>`
}

/**
 * Strips HTML tags to produce a plain-text fallback from bodyHtml.
 */
export function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/peetstander/.config/superpowers/worktrees/partnersinbiz-web/phase1-foundation
git add lib/email/types.ts lib/email/resend.ts
git commit -m "feat(email): add Email types and Resend singleton client"
```

---

## Task 2: Email List API

**Files:**
- Create: `app/api/v1/email/route.ts`
- Create: `__tests__/api/v1/email/list.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/v1/email/list.test.ts
import { GET } from '@/app/api/v1/email/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

function makeReq(search = '') {
  return new NextRequest(`http://localhost/api/v1/email${search}`, {
    method: 'GET',
    headers: { authorization: 'Bearer test-key' },
  })
}

function mockCollection(docs: object[]) {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'e1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
  })
}

describe('GET /api/v1/email', () => {
  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/email')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns list of emails', async () => {
    mockCollection([{ id: 'e1', subject: 'Hello', status: 'sent', direction: 'outbound' }])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toMatchObject({ page: 1 })
  })

  it('filters by status query param', async () => {
    mockCollection([])
    const res = await GET(makeReq('?status=sent'))
    expect(res.status).toBe(200)
    // where() was called — verify chain was used
    expect(adminDb.collection).toHaveBeenCalledWith('emails')
  })

  it('filters by direction query param', async () => {
    mockCollection([])
    const res = await GET(makeReq('?direction=outbound'))
    expect(res.status).toBe(200)
  })

  it('filters by contactId query param', async () => {
    mockCollection([])
    const res = await GET(makeReq('?contactId=c1'))
    expect(res.status).toBe(200)
  })

  it('returns empty array when no emails exist', async () => {
    mockCollection([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /Users/peetstander/.config/superpowers/worktrees/partnersinbiz-web/phase1-foundation
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/list.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '@/app/api/v1/email/route'"

- [ ] **Step 3: Implement `app/api/v1/email/route.ts`**

```typescript
/**
 * GET /api/v1/email — list emails
 *
 * Query params:
 *   direction  — "outbound" | "inbound"
 *   status     — "draft" | "scheduled" | "sent" | "failed" | "opened" | "clicked"
 *   contactId  — filter by linked contact
 *   limit      — default 50, max 200
 *   page       — default 1
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'
import type { Email, EmailDirection, EmailStatus } from '@/lib/email/types'

const VALID_DIRECTIONS: EmailDirection[] = ['outbound', 'inbound']
const VALID_STATUSES: EmailStatus[] = ['draft', 'scheduled', 'sent', 'failed', 'opened', 'clicked']

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const direction = searchParams.get('direction') as EmailDirection | null
  const status = searchParams.get('status') as EmailStatus | null
  const contactId = searchParams.get('contactId') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('emails').where('deleted', '!=', true)

  if (direction && VALID_DIRECTIONS.includes(direction)) {
    query = query.where('direction', '==', direction)
  }
  if (status && VALID_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }
  if (contactId) {
    query = query.where('contactId', '==', contactId)
  }

  const snapshot = await query
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  const emails: Email[] = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }))

  return apiSuccess(emails, 200, { total: emails.length, page, limit })
})
```

- [ ] **Step 4: Run test — verify it passes**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/list.test.ts --no-coverage
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/email/route.ts __tests__/api/v1/email/list.test.ts
git commit -m "feat(email): add email list API with direction/status/contactId filters"
```

---

## Task 3: Email Send API

**Files:**
- Create: `app/api/v1/email/send/route.ts`
- Create: `__tests__/api/v1/email/send.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/v1/email/send.test.ts
import { POST } from '@/app/api/v1/email/send/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

jest.mock('@/lib/email/resend', () => ({
  getResendClient: jest.fn(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ data: { id: 'resend-id-1' }, error: null }),
    },
  })),
  FROM_ADDRESS: 'peet@partnersinbiz.online',
  plainTextToHtml: jest.fn((t: string) => `<p>${t}</p>`),
  htmlToPlainText: jest.fn((h: string) => h.replace(/<[^>]+>/g, '')),
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

const mockAdd = jest.fn().mockResolvedValue({ id: 'email-doc-1' })
const mockDocUpdate = jest.fn().mockResolvedValue(undefined)
const mockActivitiesAdd = jest.fn().mockResolvedValue({ id: 'act-1' })

function mockCollections() {
  ;(adminDb.collection as jest.Mock).mockImplementation((col: string) => {
    if (col === 'emails') {
      return {
        add: mockAdd,
        doc: jest.fn().mockReturnValue({ update: mockDocUpdate }),
      }
    }
    if (col === 'activities') {
      return { add: mockActivitiesAdd }
    }
    return {}
  })
}

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/v1/email/send', {
    method: 'POST',
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validPayload = {
  to: 'client@example.com',
  subject: 'Hello from PiB',
  bodyText: 'This is the email body.',
  contactId: '',
}

describe('POST /api/v1/email/send', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollections()
  })

  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/email/send', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when to is missing', async () => {
    const res = await POST(makeReq({ ...validPayload, to: '' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/to/i)
  })

  it('returns 400 when subject is missing', async () => {
    const res = await POST(makeReq({ ...validPayload, subject: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when both bodyText and bodyHtml are missing', async () => {
    const res = await POST(makeReq({ to: 'a@b.com', subject: 'Hi' }))
    expect(res.status).toBe(400)
  })

  it('sends email and returns 201 with id', async () => {
    const res = await POST(makeReq(validPayload))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('email-doc-1')
  })

  it('creates a Firestore doc with status sent', async () => {
    await POST(makeReq(validPayload))
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', direction: 'outbound' }),
    )
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', resendId: 'resend-id-1' }),
    )
  })

  it('logs email_sent activity when contactId is provided', async () => {
    await POST(makeReq({ ...validPayload, contactId: 'contact-abc' }))
    expect(mockActivitiesAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'email_sent', contactId: 'contact-abc' }),
    )
  })

  it('does not log activity when contactId is empty', async () => {
    await POST(makeReq(validPayload))
    expect(mockActivitiesAdd).not.toHaveBeenCalled()
  })

  it('marks email as failed when Resend returns an error', async () => {
    const { getResendClient } = require('@/lib/email/resend')
    ;(getResendClient as jest.Mock).mockReturnValueOnce({
      emails: {
        send: jest.fn().mockResolvedValue({ data: null, error: { message: 'Bad API key' } }),
      },
    })
    const res = await POST(makeReq(validPayload))
    expect(res.status).toBe(502)
    expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/send.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '@/app/api/v1/email/send/route'"

- [ ] **Step 3: Implement `app/api/v1/email/send/route.ts`**

```typescript
/**
 * POST /api/v1/email/send — send an email immediately via Resend
 *
 * Body:
 *   to         string  (required)
 *   subject    string  (required)
 *   bodyText   string  (required if bodyHtml not provided)
 *   bodyHtml   string  (optional — if omitted, generated from bodyText)
 *   cc         string[] (optional)
 *   contactId  string  (optional — links email to a CRM contact and logs activity)
 *   sequenceId string  (optional)
 *   sequenceStep number (optional)
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getResendClient, FROM_ADDRESS, plainTextToHtml, htmlToPlainText } from '@/lib/email/resend'
import type { ApiUser } from '@/lib/api/types'

export const POST = withAuth('admin', async (req: NextRequest, user: ApiUser) => {
  const body = await req.json()
  const {
    to,
    subject,
    bodyText,
    bodyHtml,
    cc = [],
    contactId = '',
    sequenceId = '',
    sequenceStep = null,
  } = body

  if (!to?.trim()) return apiError('to is required')
  if (!subject?.trim()) return apiError('subject is required')
  if (!bodyText?.trim() && !bodyHtml?.trim()) return apiError('bodyText or bodyHtml is required')

  const finalBodyHtml = bodyHtml?.trim() || plainTextToHtml(bodyText)
  const finalBodyText = bodyText?.trim() || htmlToPlainText(bodyHtml)

  // 1. Create draft doc first so we have an id for the activity log
  const docRef = await adminDb.collection('emails').add({
    direction: 'outbound',
    contactId,
    resendId: '',
    from: FROM_ADDRESS,
    to: to.trim(),
    cc,
    subject: subject.trim(),
    bodyHtml: finalBodyHtml,
    bodyText: finalBodyText,
    status: 'draft',
    scheduledFor: null,
    sentAt: null,
    openedAt: null,
    clickedAt: null,
    sequenceId,
    sequenceStep,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
  })

  // 2. Call Resend
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: to.trim(),
    cc: cc.length ? cc : undefined,
    subject: subject.trim(),
    html: finalBodyHtml,
    text: finalBodyText,
  })

  if (error || !data?.id) {
    await adminDb.collection('emails').doc(docRef.id).update({
      status: 'failed',
    })
    return apiError(error?.message ?? 'Resend send failed', 502)
  }

  // 3. Update status to sent
  await adminDb.collection('emails').doc(docRef.id).update({
    status: 'sent',
    resendId: data.id,
    sentAt: FieldValue.serverTimestamp(),
  })

  // 4. Log activity on linked contact
  if (contactId) {
    await adminDb.collection('activities').add({
      contactId,
      dealId: '',
      type: 'email_sent',
      summary: `Email sent: ${subject.trim()}`,
      metadata: { emailId: docRef.id, to: to.trim() },
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  return apiSuccess({ id: docRef.id }, 201)
})
```

- [ ] **Step 4: Run test — verify it passes**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/send.test.ts --no-coverage
```

Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/email/send/route.ts __tests__/api/v1/email/send.test.ts
git commit -m "feat(email): add send API — Resend integration, activity logging, draft-to-sent lifecycle"
```

---

## Task 4: Schedule, Update, Delete + Cron

**Files:**
- Create: `app/api/v1/email/schedule/route.ts`
- Create: `app/api/v1/email/[id]/route.ts`
- Create: `app/api/cron/emails/route.ts`
- Modify: `vercel.json`
- Create: `__tests__/api/v1/email/schedule.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/v1/email/schedule.test.ts
import { POST as SCHEDULE } from '@/app/api/v1/email/schedule/route'
import { PUT, DELETE } from '@/app/api/v1/email/[id]/route'
import { GET as CRON } from '@/app/api/cron/emails/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

jest.mock('@/lib/email/resend', () => ({
  getResendClient: jest.fn(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ data: { id: 'resend-sched-1' }, error: null }),
    },
  })),
  FROM_ADDRESS: 'peet@partnersinbiz.online',
  plainTextToHtml: jest.fn((t: string) => `<p>${t}</p>`),
  htmlToPlainText: jest.fn((h: string) => h),
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'
process.env.CRON_SECRET = 'cron-secret'

const mockAdd = jest.fn().mockResolvedValue({ id: 'sched-email-1' })
const mockDocRef = {
  get: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
}

function mockDb(existingDoc?: object) {
  mockDocRef.get.mockResolvedValue({
    exists: !!existingDoc,
    id: 'sched-email-1',
    data: () => existingDoc ?? {},
  })
  ;(adminDb.collection as jest.Mock).mockImplementation((col: string) => {
    if (col === 'emails') {
      return {
        add: mockAdd,
        doc: jest.fn().mockReturnValue(mockDocRef),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: existingDoc
            ? [{ id: 'sched-email-1', data: () => existingDoc }]
            : [],
        }),
      }
    }
    if (col === 'activities') {
      return { add: jest.fn().mockResolvedValue({ id: 'act-1' }) }
    }
    return {}
  })
}

function makeReq(method: string, body?: object, url = 'http://localhost/api/v1/email/schedule') {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ── Schedule ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/email/schedule', () => {
  beforeEach(() => { jest.clearAllMocks(); mockDb() })

  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/email/schedule', { method: 'POST' })
    const res = await SCHEDULE(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when scheduledFor is missing', async () => {
    const res = await SCHEDULE(makeReq('POST', { to: 'a@b.com', subject: 'Hi', bodyText: 'hi' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when to is missing', async () => {
    const res = await SCHEDULE(makeReq('POST', { subject: 'Hi', bodyText: 'hi', scheduledFor: '2099-01-01T00:00:00Z' }))
    expect(res.status).toBe(400)
  })

  it('creates a scheduled email doc and returns 201', async () => {
    const res = await SCHEDULE(makeReq('POST', {
      to: 'client@example.com',
      subject: 'Future email',
      bodyText: 'See you later.',
      scheduledFor: '2099-01-01T00:00:00Z',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('sched-email-1')
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' }))
  })

  it('does NOT call Resend on schedule', async () => {
    const { getResendClient } = require('@/lib/email/resend')
    await SCHEDULE(makeReq('POST', {
      to: 'a@b.com', subject: 'Hi', bodyText: 'body',
      scheduledFor: '2099-01-01T00:00:00Z',
    }))
    expect(getResendClient).not.toHaveBeenCalled()
  })
})

// ── Update + Delete ───────────────────────────────────────────────────────────

describe('PUT /api/v1/email/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDb({ status: 'draft', subject: 'Old subject', deleted: false })
  })

  it('returns 404 when email does not exist', async () => {
    mockDocRef.get.mockResolvedValueOnce({ exists: false })
    const res = await PUT(
      makeReq('PUT', { subject: 'New subject' }, 'http://localhost/api/v1/email/sched-email-1'),
      { params: Promise.resolve({ id: 'sched-email-1' }) },
    )
    expect(res.status).toBe(404)
  })

  it('updates the email and returns 200', async () => {
    const res = await PUT(
      makeReq('PUT', { subject: 'New subject' }, 'http://localhost/api/v1/email/sched-email-1'),
      { params: Promise.resolve({ id: 'sched-email-1' }) },
    )
    expect(res.status).toBe(200)
    expect(mockDocRef.update).toHaveBeenCalledWith(expect.objectContaining({ subject: 'New subject' }))
  })
})

describe('DELETE /api/v1/email/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDb({ status: 'draft', deleted: false })
  })

  it('soft-deletes and returns 200', async () => {
    const res = await DELETE(
      makeReq('DELETE', undefined, 'http://localhost/api/v1/email/sched-email-1'),
      { params: Promise.resolve({ id: 'sched-email-1' }) },
    )
    expect(res.status).toBe(200)
    expect(mockDocRef.update).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }))
  })
})

// ── Cron ──────────────────────────────────────────────────────────────────────

describe('GET /api/cron/emails', () => {
  it('returns 401 without CRON_SECRET', async () => {
    const req = new NextRequest('http://localhost/api/cron/emails', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const res = await CRON(req)
    expect(res.status).toBe(401)
  })

  it('processes due scheduled emails and returns processed count', async () => {
    const scheduledEmail = {
      id: 'sched-email-1',
      to: 'client@example.com',
      from: 'peet@partnersinbiz.online',
      cc: [],
      subject: 'Scheduled hello',
      bodyHtml: '<p>Hi</p>',
      bodyText: 'Hi',
      status: 'scheduled',
      contactId: '',
      sequenceId: '',
    }
    ;(adminDb.collection as jest.Mock).mockImplementation((col: string) => {
      if (col === 'emails') {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: [{ id: 'sched-email-1', data: () => scheduledEmail }],
          }),
          doc: jest.fn().mockReturnValue({ update: mockDocRef.update }),
        }
      }
      if (col === 'activities') {
        return { add: jest.fn().mockResolvedValue({}) }
      }
      return {}
    })

    const req = new NextRequest('http://localhost/api/cron/emails', {
      headers: { authorization: 'Bearer cron-secret' },
    })
    const res = await CRON(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.processed).toBe(1)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/schedule.test.ts --no-coverage
```

Expected: FAIL — multiple "Cannot find module" errors

- [ ] **Step 3: Implement `app/api/v1/email/schedule/route.ts`**

```typescript
/**
 * POST /api/v1/email/schedule — save email as scheduled (no send)
 *
 * Body:
 *   to           string    (required)
 *   subject      string    (required)
 *   scheduledFor string    (required — ISO datetime)
 *   bodyText     string    (required if bodyHtml not provided)
 *   bodyHtml     string    (optional)
 *   cc           string[]  (optional)
 *   contactId    string    (optional)
 *   sequenceId   string    (optional)
 *   sequenceStep number    (optional)
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FROM_ADDRESS, plainTextToHtml, htmlToPlainText } from '@/lib/email/resend'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json()
  const {
    to,
    subject,
    bodyText,
    bodyHtml,
    scheduledFor,
    cc = [],
    contactId = '',
    sequenceId = '',
    sequenceStep = null,
  } = body

  if (!to?.trim()) return apiError('to is required')
  if (!subject?.trim()) return apiError('subject is required')
  if (!bodyText?.trim() && !bodyHtml?.trim()) return apiError('bodyText or bodyHtml is required')
  if (!scheduledFor) return apiError('scheduledFor is required')

  const scheduledAt = Timestamp.fromDate(new Date(scheduledFor))

  const docRef = await adminDb.collection('emails').add({
    direction: 'outbound',
    contactId,
    resendId: '',
    from: FROM_ADDRESS,
    to: to.trim(),
    cc,
    subject: subject.trim(),
    bodyHtml: bodyHtml?.trim() || plainTextToHtml(bodyText),
    bodyText: bodyText?.trim() || htmlToPlainText(bodyHtml),
    status: 'scheduled',
    scheduledFor: scheduledAt,
    sentAt: null,
    openedAt: null,
    clickedAt: null,
    sequenceId,
    sequenceStep,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id: docRef.id }, 201)
})
```

- [ ] **Step 4: Implement `app/api/v1/email/[id]/route.ts`**

```typescript
/**
 * PUT    /api/v1/email/:id — update draft or scheduled email
 * DELETE /api/v1/email/:id — soft-delete (sets deleted: true)
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

type Params = { params: Promise<{ id: string }> }

export const PUT = withAuth('admin', async (req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('emails').doc(id).get()
  if (!doc.exists) return apiError('Email not found', 404)

  const body = await req.json()
  await adminDb.collection('emails').doc(id).update({
    ...body,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('emails').doc(id).get()
  if (!doc.exists) return apiError('Email not found', 404)

  await adminDb.collection('emails').doc(id).update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
```

- [ ] **Step 5: Implement `app/api/cron/emails/route.ts`**

```typescript
/**
 * GET /api/cron/emails — process scheduled emails due now
 *
 * Secured by Authorization: Bearer ${CRON_SECRET}
 * Vercel cron schedule: every 15 minutes  (see vercel.json)
 *
 * For each email where status == "scheduled" AND scheduledFor <= now:
 *   1. Send via Resend
 *   2. Update status to "sent", set sentAt and resendId
 *   3. Log email_sent activity on linked contact (if contactId set)
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { getResendClient } from '@/lib/email/resend'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Timestamp.now()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await (adminDb.collection('emails') as any)
    .where('status', '==', 'scheduled')
    .where('scheduledFor', '<=', now)
    .get()

  const resend = getResendClient()
  let processed = 0

  for (const docSnap of snapshot.docs) {
    const email = docSnap.data() as {
      to: string
      from: string
      cc: string[]
      subject: string
      bodyHtml: string
      bodyText: string
      contactId: string
      sequenceId: string
    }

    const { data, error } = await resend.emails.send({
      from: email.from,
      to: email.to,
      cc: email.cc?.length ? email.cc : undefined,
      subject: email.subject,
      html: email.bodyHtml,
      text: email.bodyText,
    })

    if (error || !data?.id) {
      await adminDb.collection('emails').doc(docSnap.id).update({ status: 'failed' })
      continue
    }

    await adminDb.collection('emails').doc(docSnap.id).update({
      status: 'sent',
      resendId: data.id,
      sentAt: FieldValue.serverTimestamp(),
    })

    if (email.contactId) {
      await adminDb.collection('activities').add({
        contactId: email.contactId,
        dealId: '',
        type: 'email_sent',
        summary: `Email sent: ${email.subject}`,
        metadata: { emailId: docSnap.id, to: email.to },
        createdBy: 'cron',
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    processed++
  }

  return NextResponse.json({ success: true, data: { processed } })
}
```

- [ ] **Step 6: Update `vercel.json`**

Replace entire file content with:

```json
{
  "crons": [
    {
      "path": "/api/cron/sequences",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/emails",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

- [ ] **Step 7: Run test — verify it passes**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/schedule.test.ts --no-coverage
```

Expected: PASS — all tests

- [ ] **Step 8: Commit**

```bash
git add \
  app/api/v1/email/schedule/route.ts \
  app/api/v1/email/[id]/route.ts \
  app/api/cron/emails/route.ts \
  vercel.json \
  __tests__/api/v1/email/schedule.test.ts
git commit -m "feat(email): add schedule, update, delete APIs and emails cron processor"
```

---

## Task 5: Webhook

**Files:**
- Create: `app/api/v1/email/webhook/route.ts`
- Create: `__tests__/api/v1/email/webhook.test.ts`

The webhook is a **public** POST endpoint — no `withAuth`. Security model: Resend sends to a secret URL path. A TODO comment marks where signature verification goes in production.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/v1/email/webhook.test.ts
import { POST } from '@/app/api/v1/email/webhook/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'

const mockDocUpdate = jest.fn().mockResolvedValue(undefined)
const mockQuery = {
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn(),
}

function mockEmail(id: string) {
  mockQuery.get.mockResolvedValue({
    empty: false,
    docs: [{ id, ref: { update: mockDocUpdate } }],
  })
  ;(adminDb.collection as jest.Mock).mockReturnValue(mockQuery)
}

function mockNoEmail() {
  mockQuery.get.mockResolvedValue({ empty: true, docs: [] })
  ;(adminDb.collection as jest.Mock).mockReturnValue(mockQuery)
}

function makeReq(payload: object) {
  return new NextRequest('http://localhost/api/v1/email/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('POST /api/v1/email/webhook', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 for unknown event type (no-op)', async () => {
    mockNoEmail()
    const res = await POST(makeReq({ type: 'email.sent', data: { email_id: 'r1' } }))
    expect(res.status).toBe(200)
  })

  it('returns 200 and skips update when resendId not found', async () => {
    mockNoEmail()
    const res = await POST(makeReq({ type: 'email.opened', data: { email_id: 'unknown' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).not.toHaveBeenCalled()
  })

  it('updates status to opened on email.opened', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.opened', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'opened', openedAt: expect.anything() }),
    )
  })

  it('updates status to clicked on email.clicked', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.clicked', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'clicked', clickedAt: expect.anything() }),
    )
  })

  it('keeps status as sent on email.delivered', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.delivered', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    // delivered does not change status — no update call needed
  })

  it('updates status to failed on email.bounced', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.bounced', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('updates status to failed on email.delivery_delayed', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.delivery_delayed', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('returns 400 on malformed payload', async () => {
    const req = new NextRequest('http://localhost/api/v1/email/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/webhook.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '@/app/api/v1/email/webhook/route'"

- [ ] **Step 3: Implement `app/api/v1/email/webhook/route.ts`**

```typescript
/**
 * POST /api/v1/email/webhook — Resend webhook receiver
 *
 * Public endpoint — no auth middleware.
 * Security model: Resend posts to a secret path. Add signature verification in production.
 *
 * Handled event types:
 *   email.delivered        → no status change (already "sent")
 *   email.opened           → status = "opened",  openedAt = now
 *   email.clicked          → status = "clicked", clickedAt = now
 *   email.bounced          → status = "failed"
 *   email.delivery_delayed → status = "failed"
 *
 * Payload shape from Resend:
 *   { type: string, data: { email_id: string, ... } }
 *
 * We store Resend's email ID in the email doc as `resendId`.
 * Lookup: query emails where resendId == data.email_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'

// TODO(production): verify Resend webhook signature using svix or Resend's signing secret
// See: https://resend.com/docs/dashboard/webhooks/introduction

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: { type: string; data: { email_id: string } }

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, data } = payload
  const resendEmailId = data?.email_id
  if (!resendEmailId) {
    return NextResponse.json({ ok: true, note: 'no email_id' })
  }

  // Find the Firestore doc with this resendId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await (adminDb.collection('emails') as any)
    .where('resendId', '==', resendEmailId)
    .limit(1)
    .get()

  if (snapshot.empty) {
    return NextResponse.json({ ok: true, note: 'email not found' })
  }

  const docRef = snapshot.docs[0].ref

  if (type === 'email.opened') {
    await docRef.update({ status: 'opened', openedAt: FieldValue.serverTimestamp() })
  } else if (type === 'email.clicked') {
    await docRef.update({ status: 'clicked', clickedAt: FieldValue.serverTimestamp() })
  } else if (type === 'email.bounced' || type === 'email.delivery_delayed') {
    await docRef.update({ status: 'failed' })
  }
  // email.delivered → no change, already "sent"

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/webhook.test.ts --no-coverage
```

Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/email/webhook/route.ts __tests__/api/v1/email/webhook.test.ts
git commit -m "feat(email): add Resend webhook receiver — maps delivery/open/click events to Firestore status"
```

---

## Task 6: Admin Email Inbox Page

**Files:**
- Create: `components/admin/email/EmailList.tsx`
- Create: `components/admin/email/EmailDetail.tsx`
- Create: `app/(admin)/admin/email/page.tsx`

No tests for UI components.

- [ ] **Step 1: Create `components/admin/email/EmailList.tsx`**

```typescript
// components/admin/email/EmailList.tsx
'use client'
import Link from 'next/link'

export type EmailFolder = 'sent' | 'scheduled' | 'drafts' | 'failed'

const FOLDERS: { label: string; value: EmailFolder; status: string }[] = [
  { label: 'Sent',      value: 'sent',      status: 'sent'      },
  { label: 'Scheduled', value: 'scheduled', status: 'scheduled' },
  { label: 'Drafts',    value: 'drafts',    status: 'draft'     },
  { label: 'Failed',    value: 'failed',    status: 'failed'    },
]

interface EmailRow {
  id: string
  to: string
  subject: string
  status: string
  sentAt: unknown
  scheduledFor: unknown
  createdAt: unknown
}

interface EmailListProps {
  folder: EmailFolder
  emails: EmailRow[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onFolderChange: (f: EmailFolder) => void
}

export function EmailList({
  folder,
  emails,
  loading,
  selectedId,
  onSelect,
  onFolderChange,
}: EmailListProps) {
  return (
    <div className="flex flex-col h-full border-r border-outline-variant w-72 shrink-0">
      {/* Folder tabs */}
      <div className="border-b border-outline-variant">
        {FOLDERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFolderChange(f.value)}
            className={`w-full text-left px-4 py-2.5 text-sm font-label transition-colors ${
              folder === f.value
                ? 'text-on-surface bg-surface-container'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Compose button */}
      <div className="px-4 py-3 border-b border-outline-variant">
        <Link
          href="/admin/email/compose"
          className="block w-full text-center py-2 text-sm font-label text-black bg-on-surface hover:opacity-90 transition-opacity"
        >
          + Compose
        </Link>
      </div>

      {/* Email rows */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-on-surface-variant text-sm mb-3">No emails here.</p>
            <Link href="/admin/email/compose" className="text-sm text-on-surface underline">
              Compose your first email →
            </Link>
          </div>
        ) : (
          emails.map((email) => (
            <button
              key={email.id}
              onClick={() => onSelect(email.id)}
              className={`w-full text-left px-4 py-3 border-b border-outline-variant transition-colors ${
                selectedId === email.id
                  ? 'bg-surface-container'
                  : 'hover:bg-surface-container'
              }`}
            >
              <p className="text-sm text-on-surface font-medium truncate">{email.subject || '(no subject)'}</p>
              <p className="text-xs text-on-surface-variant truncate mt-0.5">{email.to}</p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/admin/email/EmailDetail.tsx`**

```typescript
// components/admin/email/EmailDetail.tsx
'use client'

interface EmailDetailProps {
  email: {
    id: string
    to: string
    from: string
    cc?: string[]
    subject: string
    bodyHtml: string
    bodyText: string
    status: string
    sentAt: unknown
    scheduledFor: unknown
    createdAt: unknown
  } | null
  loading: boolean
}

export function EmailDetail({ email, loading }: EmailDetailProps) {
  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-3">
        <div className="h-8 bg-surface-container animate-pulse w-1/2" />
        <div className="h-4 bg-surface-container animate-pulse w-1/3" />
        <div className="h-4 bg-surface-container animate-pulse w-1/4" />
        <div className="mt-6 h-40 bg-surface-container animate-pulse" />
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-on-surface-variant text-sm">Select an email to read it.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Subject + status */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface">
          {email.subject || '(no subject)'}
        </h2>
        <span className="border border-outline-variant text-[10px] font-label uppercase tracking-widest px-2 py-0.5 text-on-surface-variant shrink-0">
          {email.status}
        </span>
      </div>

      {/* Meta */}
      <dl className="text-sm space-y-1 mb-6">
        <div className="flex gap-2">
          <dt className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant w-12 pt-0.5">From</dt>
          <dd className="text-on-surface">{email.from}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant w-12 pt-0.5">To</dt>
          <dd className="text-on-surface">{email.to}</dd>
        </div>
        {email.cc && email.cc.length > 0 && (
          <div className="flex gap-2">
            <dt className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant w-12 pt-0.5">CC</dt>
            <dd className="text-on-surface">{email.cc.join(', ')}</dd>
          </div>
        )}
      </dl>

      {/* Body */}
      <div className="border border-outline-variant p-4">
        {email.bodyHtml ? (
          <div
            className="text-sm text-on-surface prose-sm"
            dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
          />
        ) : (
          <pre className="text-sm text-on-surface whitespace-pre-wrap font-sans">{email.bodyText}</pre>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(admin)/admin/email/page.tsx`**

```typescript
// app/(admin)/admin/email/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { EmailList, type EmailFolder } from '@/components/admin/email/EmailList'
import { EmailDetail } from '@/components/admin/email/EmailDetail'

const FOLDER_STATUS: Record<EmailFolder, string> = {
  sent: 'sent',
  scheduled: 'scheduled',
  drafts: 'draft',
  failed: 'failed',
}

interface EmailRow {
  id: string
  to: string
  subject: string
  status: string
  sentAt: unknown
  scheduledFor: unknown
  createdAt: unknown
  from: string
  cc: string[]
  bodyHtml: string
  bodyText: string
}

export default function EmailInboxPage() {
  const [folder, setFolder] = useState<EmailFolder>('sent')
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailEmail, setDetailEmail] = useState<EmailRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchEmails = useCallback(async () => {
    setListLoading(true)
    setSelectedId(null)
    setDetailEmail(null)
    const status = FOLDER_STATUS[folder]
    const res = await fetch(`/api/v1/email?status=${status}&limit=100`)
    const body = await res.json()
    setEmails(body.data ?? [])
    setListLoading(false)
  }, [folder])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  async function handleSelect(id: string) {
    setSelectedId(id)
    setDetailLoading(true)
    // Email data already in list — find it instead of a separate fetch
    const found = emails.find((e) => e.id === id) ?? null
    setDetailEmail(found)
    setDetailLoading(false)
  }

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      <EmailList
        folder={folder}
        emails={emails}
        loading={listLoading}
        selectedId={selectedId}
        onSelect={handleSelect}
        onFolderChange={(f) => setFolder(f)}
      />
      <EmailDetail email={detailEmail} loading={detailLoading} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add \
  components/admin/email/EmailList.tsx \
  components/admin/email/EmailDetail.tsx \
  app/\(admin\)/admin/email/page.tsx
git commit -m "feat(email): add admin email inbox page with folder navigation and split-pane detail view"
```

---

## Task 7: Admin Compose Page

**Files:**
- Create: `components/admin/email/ComposeForm.tsx`
- Create: `app/(admin)/admin/email/compose/page.tsx`

No tests for UI.

- [ ] **Step 1: Create `components/admin/email/ComposeForm.tsx`**

```typescript
// components/admin/email/ComposeForm.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ComposeForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    to: '',
    cc: '',
    subject: '',
    bodyText: '',
  })
  const [mode, setMode] = useState<'send' | 'schedule'>('send')
  const [scheduledFor, setScheduledFor] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError('')

    const cc = form.cc
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const endpoint = mode === 'send' ? '/api/v1/email/send' : '/api/v1/email/schedule'
    const payload: Record<string, unknown> = {
      to: form.to,
      cc,
      subject: form.subject,
      bodyText: form.bodyText,
    }
    if (mode === 'schedule') payload.scheduledFor = scheduledFor

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed')
      router.push('/admin/email')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  const inputCls =
    'bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-on-surface'
  const labelCls = 'text-[10px] font-label uppercase tracking-widest text-on-surface-variant'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-2xl">
      {/* To */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>To *</label>
        <input
          type="email"
          required
          value={form.to}
          onChange={set('to')}
          placeholder="recipient@example.com"
          className={inputCls}
        />
      </div>

      {/* CC */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>CC (comma-separated)</label>
        <input
          type="text"
          value={form.cc}
          onChange={set('cc')}
          placeholder="cc1@example.com, cc2@example.com"
          className={inputCls}
        />
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Subject *</label>
        <input
          type="text"
          required
          value={form.subject}
          onChange={set('subject')}
          className={inputCls}
        />
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Body *</label>
        <textarea
          required
          value={form.bodyText}
          onChange={set('bodyText')}
          rows={10}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* Send / Schedule toggle */}
      <div className="flex gap-3 items-center">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="send"
            checked={mode === 'send'}
            onChange={() => setMode('send')}
            className="accent-on-surface"
          />
          <span className="text-sm text-on-surface-variant font-label">Send now</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="schedule"
            checked={mode === 'schedule'}
            onChange={() => setMode('schedule')}
            className="accent-on-surface"
          />
          <span className="text-sm text-on-surface-variant font-label">Schedule for…</span>
        </label>
      </div>

      {/* Datetime picker — shown only in schedule mode */}
      {mode === 'schedule' && (
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Send at *</label>
          <input
            type="datetime-local"
            required
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className={inputCls}
          />
        </div>
      )}

      {error && (
        <p className="text-[11px]" style={{ color: 'var(--color-accent)' }}>{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={sending}
          className="px-6 py-2 text-sm font-label text-black bg-on-surface hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {sending ? 'Sending…' : mode === 'send' ? 'Send Now' : 'Schedule Email'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/email')}
          className="px-6 py-2 text-sm font-label text-on-surface-variant border border-outline-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Create `app/(admin)/admin/email/compose/page.tsx`**

```typescript
// app/(admin)/admin/email/compose/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { ComposeForm } from '@/components/admin/email/ComposeForm'

export default function ComposePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Compose Email</h1>
        <p className="text-on-surface-variant text-sm mt-0.5">
          Send immediately or schedule for later.
        </p>
      </div>
      <ComposeForm />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add \
  components/admin/email/ComposeForm.tsx \
  app/\(admin\)/admin/email/compose/page.tsx
git commit -m "feat(email): add compose page with send/schedule toggle and CC support"
```

---

## Task 8: Wire Enquiry Notification Email

**Files:**
- Modify: `app/api/enquiries/route.ts`

The existing route already imports `Resend` and calls `getResend().emails.send(...)`. Replace that pattern with the shared `getResendClient()` from `lib/email/resend.ts`, and wrap the send in a try/catch so email failure never breaks the form submission response.

- [ ] **Step 1: Update `app/api/enquiries/route.ts`**

Replace the top of the file to use the shared client and wrap in try/catch. The full updated file:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { getResendClient, FROM_ADDRESS } from '@/lib/email/resend'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const VALID_PROJECT_TYPES = ['web', 'mobile', 'ai', 'design']

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company, projectType, details, userId } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Email is invalid' }, { status: 400 })
  if (!details?.trim()) return NextResponse.json({ error: 'Project details are required' }, { status: 400 })
  if (!projectType || !VALID_PROJECT_TYPES.includes(projectType)) {
    return NextResponse.json({ error: 'Invalid project type' }, { status: 400 })
  }

  const docRef = await adminDb.collection('enquiries').add({
    userId: userId ?? null,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: company?.trim() ?? '',
    projectType: projectType,
    details: details.trim(),
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
    assignedTo: null,
  })

  // Also create a CRM contact for this lead
  await adminDb.collection('contacts').add({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: company?.trim() ?? '',
    phone: '',
    website: '',
    source: 'form',
    type: 'lead',
    stage: 'new',
    tags: [],
    notes: `Enquiry ID: ${docRef.id}`,
    assignedTo: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastContactedAt: null,
  })

  // Notification email — fire-and-forget; failure must not break form submission
  try {
    await getResendClient().emails.send({
      from: FROM_ADDRESS,
      to: 'peet@partnersinbiz.online',
      subject: `New Project Inquiry from ${escapeHtml(name)}`,
      html: `
        <h2>New Project Inquiry</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company ?? 'Not provided')}</p>
        <p><strong>Project Type:</strong> ${escapeHtml(projectType)}</p>
        <p><strong>Details:</strong></p>
        <p>${escapeHtml(details)}</p>
        <p><em>Enquiry ID: ${docRef.id}</em></p>
      `,
    })
  } catch (err) {
    // Log but do not fail the request
    console.error('[enquiries] notification email failed:', err)
  }

  return NextResponse.json({ id: docRef.id }, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/enquiries/route.ts
git commit -m "feat(email): wire enquiry notification through shared Resend client with try/catch guard"
```

---

## Task 9: Full Test Suite + Build Check

Run all tests together and verify the TypeScript build compiles cleanly.

- [ ] **Step 1: Run all email tests**

```bash
cd /Users/peetstander/.config/superpowers/worktrees/partnersinbiz-web/phase1-foundation
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest __tests__/api/v1/email/ --no-coverage
```

Expected output:
```
PASS  __tests__/api/v1/email/list.test.ts
PASS  __tests__/api/v1/email/send.test.ts
PASS  __tests__/api/v1/email/schedule.test.ts
PASS  __tests__/api/v1/email/webhook.test.ts

Test Suites: 4 passed, 4 total
Tests:       XX passed, XX total
```

- [ ] **Step 2: Run full test suite (all phases)**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx jest --no-coverage
```

Expected: all existing tests still pass — no regressions.

- [ ] **Step 3: TypeScript build check**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Next.js build check**

```bash
PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin npx next build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat(email): Phase 3 complete — email module, cron, webhook, compose UI, enquiry notification"
```

---

## Environment Variables Required

Ensure these are set in Vercel (and `.env.local` for local dev):

| Variable | Value |
|----------|-------|
| `RESEND_API_KEY` | Your Resend API key |
| `CRON_SECRET` | A strong random string (used to secure `/api/cron/emails`) |

`RESEND_API_KEY` is already in use by the enquiry route. `CRON_SECRET` must be added.

In Vercel dashboard: Settings → Environment Variables → add `CRON_SECRET`.

---

## Firestore Indexes Required

The email list query chains multiple `where` clauses with `orderBy('createdAt', 'desc')`. Firestore requires composite indexes for compound queries. Add these to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "emails",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "deleted", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "emails",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "deleted", "order": "ASCENDING" },
        { "fieldPath": "direction", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "emails",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "deleted", "order": "ASCENDING" },
        { "fieldPath": "contactId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "emails",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "scheduledFor", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Deploy with: `firebase deploy --only firestore:indexes`

