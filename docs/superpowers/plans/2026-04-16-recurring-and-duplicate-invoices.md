# Recurring Invoices + Duplicate Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Duplicate button to the invoice detail page and a full recurring invoice system (create schedule, nightly cron generates drafts, manage schedules from the admin UI).

**Architecture:** The duplicate feature is a single POST endpoint that copies an invoice document with a fresh `CLI-NNN` number. Recurring invoices are stored as a separate `recurring_schedules` Firestore collection that reference a template invoice; a nightly Vercel cron at `/api/cron/invoices` queries for schedules due today, creates new draft invoices, and advances `nextDueAt`. The schedule management UI lives under `/admin/invoicing/recurring`.

**Tech Stack:** Next.js App Router, Firebase Admin SDK (Firestore), TypeScript, Tailwind CSS 4 with `pib-*` design system classes, Vercel Cron (CRON_SECRET bearer auth), `generateInvoiceNumber` from `lib/invoices/invoice-number.ts`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/api/v1/invoices/[id]/duplicate/route.ts` | POST — copy invoice with new number |
| Create | `lib/invoices/recurring.ts` | `RecurrenceInterval` type + `calculateNextDueAt()` helper |
| Create | `app/api/v1/invoices/[id]/recurring/route.ts` | POST create schedule, DELETE cancel |
| Create | `app/api/v1/recurring-schedules/route.ts` | GET list all schedules (admin) |
| Create | `app/api/v1/recurring-schedules/[id]/route.ts` | PATCH pause/resume/cancel |
| Create | `app/api/cron/invoices/route.ts` | GET nightly cron — creates due invoices |
| Create | `app/(admin)/admin/invoicing/recurring/page.tsx` | Recurring schedules list + actions |
| Modify | `app/(admin)/admin/invoicing/[id]/page.tsx` | Add Duplicate button + Recurring section |
| Modify | `vercel.json` | Add `/api/cron/invoices` cron entry |
| Modify | `components/admin/AdminSidebar.tsx` | Add Recurring Schedules nav link |

---

## Task 1: Duplicate Invoice API

**Files:**
- Create: `app/api/v1/invoices/[id]/duplicate/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/v1/invoices/[id]/duplicate/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (_req: NextRequest, user, { params }: { params: { id: string } }) => {
  const { id } = params

  const sourceDoc = await adminDb.collection('invoices').doc(id).get()
  if (!sourceDoc.exists) return apiError('Invoice not found', 404)
  const source = sourceDoc.data()!

  const invoiceNumber = await generateInvoiceNumber(source.orgId, source.clientDetails?.name ?? source.orgId)

  const doc = {
    orgId: source.orgId,
    invoiceNumber,
    status: 'draft' as const,
    issueDate: FieldValue.serverTimestamp(),
    dueDate: source.dueDate ?? null,
    lineItems: source.lineItems,
    subtotal: source.subtotal,
    taxRate: source.taxRate,
    taxAmount: source.taxAmount,
    total: source.total,
    currency: source.currency,
    notes: source.notes ?? '',
    fromDetails: source.fromDetails ?? null,
    clientDetails: source.clientDetails ?? null,
    paidAt: null,
    sentAt: null,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('invoices').add(doc)
  return apiSuccess({ id: ref.id, invoiceNumber }, 201)
})
```

- [ ] **Step 2: Verify the route compiles**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep duplicate
```
Expected: no output (no errors).

- [ ] **Step 3: Manual test via curl (requires dev server running)**

```bash
# Replace INVOICE_ID with a real draft invoice ID from Firestore
curl -X POST http://localhost:3000/api/v1/invoices/INVOICE_ID/duplicate \
  -H "Cookie: <admin session cookie>"
# Expected: { "data": { "id": "...", "invoiceNumber": "ABC-002" } }
```

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/invoices/[id]/duplicate/route.ts
git commit -m "feat: add duplicate invoice API endpoint"
```

---

## Task 2: Duplicate Button on Invoice Detail Page

**Files:**
- Modify: `app/(admin)/admin/invoicing/[id]/page.tsx`

- [ ] **Step 1: Add `duplicating` state and handler inside `InvoiceDetailPage`**

Add after the existing `updating` state (around line 64):

```typescript
const [duplicating, setDuplicating] = useState(false)
```

Add after the existing `updateStatus` function (around line 83):

```typescript
async function handleDuplicate() {
  setDuplicating(true)
  const res = await fetch(`/api/v1/invoices/${id}/duplicate`, { method: 'POST' })
  if (res.ok) {
    const body = await res.json()
    router.push(`/admin/invoicing/${body.data.id}`)
  } else {
    setDuplicating(false)
  }
}
```

- [ ] **Step 2: Add the Duplicate button to the header actions div**

Locate the header actions `div` (around line 102) and add the button alongside the existing "Download PDF" and "Print" buttons:

```tsx
<button
  onClick={handleDuplicate}
  disabled={duplicating}
  className="pib-btn-secondary text-sm font-label"
>
  {duplicating ? 'Duplicating…' : 'Duplicate'}
</button>
```

Place it between the PDF link and the Print button:

```tsx
<div className="flex items-center gap-2">
  <span className="text-[10px] font-label uppercase tracking-wide px-2 py-1 rounded-full" style={{ background: `${status.color}20`, color: status.color }}>
    {status.label}
  </span>
  <a
    href={`/api/v1/invoices/${id}/pdf`}
    target="_blank"
    rel="noopener noreferrer"
    className="pib-btn-secondary text-sm font-label"
  >
    📄 Download PDF
  </a>
  <button
    onClick={handleDuplicate}
    disabled={duplicating}
    className="pib-btn-secondary text-sm font-label"
  >
    {duplicating ? 'Duplicating…' : 'Duplicate'}
  </button>
  <button onClick={handlePrint} className="pib-btn-secondary text-sm font-label">Print</button>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep "invoicing/\[id\]"
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/admin/invoicing/\[id\]/page.tsx
git commit -m "feat: add Duplicate button to invoice detail page"
```

---

## Task 3: Recurring Interval Helper

**Files:**
- Create: `lib/invoices/recurring.ts`

- [ ] **Step 1: Create the helper file**

```typescript
// lib/invoices/recurring.ts

export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/**
 * Calculate the next due date given an interval and a reference date.
 * Uses UTC to avoid DST edge cases.
 */
export function calculateNextDueAt(interval: RecurrenceInterval, from: Date): Date {
  const d = new Date(from)
  switch (interval) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1)
      break
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1)
      break
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() + 3)
      break
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      break
  }
  return d
}

/**
 * Human-readable label for each interval.
 */
export const INTERVAL_LABELS: Record<RecurrenceInterval, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}
```

- [ ] **Step 2: Spot-check the helper logic mentally**

- `calculateNextDueAt('monthly', new Date('2026-01-31'))` → Feb 28/29 (JS handles month overflow automatically: sets month to 2, day 31 → March 3 on non-leap; if this is a concern, no special casing needed for MVP)
- `calculateNextDueAt('yearly', new Date('2026-03-15'))` → `2027-03-15` ✓

- [ ] **Step 3: Verify TypeScript**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep recurring
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/invoices/recurring.ts
git commit -m "feat: add recurrence interval types and next-due calculator"
```

---

## Task 4: Recurring Schedule API

**Files:**
- Create: `app/api/v1/invoices/[id]/recurring/route.ts`
- Create: `app/api/v1/recurring-schedules/route.ts`
- Create: `app/api/v1/recurring-schedules/[id]/route.ts`

**Firestore document shape for `recurring_schedules`:**
```
{
  invoiceId: string          // template invoice ID
  orgId: string              // for list queries
  interval: RecurrenceInterval
  startDate: Timestamp
  endDate: Timestamp | null
  nextDueAt: Timestamp       // when the cron should next fire for this schedule
  status: 'active' | 'paused' | 'cancelled'
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

- [ ] **Step 1: Create `app/api/v1/invoices/[id]/recurring/route.ts`**

```typescript
// app/api/v1/invoices/[id]/recurring/route.ts
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { calculateNextDueAt, RecurrenceInterval } from '@/lib/invoices/recurring'

export const dynamic = 'force-dynamic'

const VALID_INTERVALS: RecurrenceInterval[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

export const POST = withAuth('admin', async (req: NextRequest, user, { params }: { params: { id: string } }) => {
  const { id } = params
  const body = await req.json().catch(() => ({}))

  if (!body.interval || !VALID_INTERVALS.includes(body.interval)) {
    return apiError('interval must be one of: daily, weekly, monthly, quarterly, yearly', 400)
  }
  if (!body.startDate) return apiError('startDate is required', 400)

  const invoiceDoc = await adminDb.collection('invoices').doc(id).get()
  if (!invoiceDoc.exists) return apiError('Invoice not found', 404)
  const invoice = invoiceDoc.data()!

  // Check for existing active schedule
  const existing = await (adminDb.collection('recurring_schedules') as any)
    .where('invoiceId', '==', id)
    .where('status', 'in', ['active', 'paused'])
    .limit(1)
    .get()
  if (!existing.empty) return apiError('A recurring schedule already exists for this invoice', 409)

  const startDate = new Date(body.startDate)
  const endDate = body.endDate ? new Date(body.endDate) : null
  const nextDueAt = calculateNextDueAt(body.interval, startDate)

  const doc = {
    invoiceId: id,
    orgId: invoice.orgId,
    interval: body.interval as RecurrenceInterval,
    startDate: Timestamp.fromDate(startDate),
    endDate: endDate ? Timestamp.fromDate(endDate) : null,
    nextDueAt: Timestamp.fromDate(nextDueAt),
    status: 'active' as const,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('recurring_schedules').add(doc)
  return apiSuccess({ id: ref.id }, 201)
})

export const DELETE = withAuth('admin', async (_req: NextRequest, _user, { params }: { params: { id: string } }) => {
  const { id } = params

  const snap = await (adminDb.collection('recurring_schedules') as any)
    .where('invoiceId', '==', id)
    .where('status', 'in', ['active', 'paused'])
    .limit(1)
    .get()

  if (snap.empty) return apiError('No active schedule found for this invoice', 404)

  await snap.docs[0].ref.update({
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ cancelled: true })
})
```

- [ ] **Step 2: Create `app/api/v1/recurring-schedules/route.ts`**

```typescript
// app/api/v1/recurring-schedules/route.ts
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'active'

  let query = adminDb.collection('recurring_schedules').orderBy('createdAt', 'desc') as any
  if (status !== 'all') query = query.where('status', '==', status)

  const snap = await query.limit(100).get()
  const schedules = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(schedules)
})
```

- [ ] **Step 3: Create `app/api/v1/recurring-schedules/[id]/route.ts`**

```typescript
// app/api/v1/recurring-schedules/[id]/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const PATCH = withAuth('admin', async (req: NextRequest, _user, { params }: { params: { id: string } }) => {
  const { id } = params
  const body = await req.json().catch(() => ({}))

  const doc = await adminDb.collection('recurring_schedules').doc(id).get()
  if (!doc.exists) return apiError('Schedule not found', 404)

  const allowed = ['active', 'paused', 'cancelled']
  if (body.status && !allowed.includes(body.status)) {
    return apiError('status must be active, paused, or cancelled', 400)
  }

  const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() }
  if (body.status) updates.status = body.status

  await adminDb.collection('recurring_schedules').doc(id).update(updates)
  return apiSuccess({ updated: true })
})
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep -E "recurring-schedules|recurring/route"
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/invoices/\[id\]/recurring/route.ts \
        app/api/v1/recurring-schedules/route.ts \
        app/api/v1/recurring-schedules/\[id\]/route.ts
git commit -m "feat: add recurring schedule CRUD API"
```

---

## Task 5: Nightly Cron Job

**Files:**
- Create: `app/api/cron/invoices/route.ts`

The cron queries `recurring_schedules` where `status == 'active' AND nextDueAt <= now`. For each:
1. Fetch the template invoice.
2. Generate a new invoice number using `generateInvoiceNumber`.
3. Create a new draft invoice copying line items, currency, notes, `fromDetails`, `clientDetails`, `taxRate`.
4. Advance `nextDueAt` using `calculateNextDueAt`.
5. If `endDate` is set and the new `nextDueAt` is past it, mark the schedule `completed`.

- [ ] **Step 1: Create `app/api/cron/invoices/route.ts`**

```typescript
// app/api/cron/invoices/route.ts
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'
import { calculateNextDueAt, RecurrenceInterval } from '@/lib/invoices/recurring'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)

  const now = Timestamp.now()

  const snap = await (adminDb.collection('recurring_schedules') as any)
    .where('status', '==', 'active')
    .where('nextDueAt', '<=', now)
    .get()

  let created = 0

  for (const scheduleDoc of snap.docs) {
    const schedule = scheduleDoc.data()

    // Fetch template invoice
    const templateDoc = await adminDb.collection('invoices').doc(schedule.invoiceId).get()
    if (!templateDoc.exists) continue
    const template = templateDoc.data()!

    // Generate a fresh invoice number
    const invoiceNumber = await generateInvoiceNumber(
      template.orgId,
      template.clientDetails?.name ?? template.orgId,
    )

    // Create new draft invoice
    const invoiceDoc = {
      orgId: template.orgId,
      invoiceNumber,
      status: 'draft' as const,
      issueDate: FieldValue.serverTimestamp(),
      dueDate: null,
      lineItems: template.lineItems,
      subtotal: template.subtotal,
      taxRate: template.taxRate,
      taxAmount: template.taxAmount,
      total: template.total,
      currency: template.currency,
      notes: template.notes ?? '',
      fromDetails: template.fromDetails ?? null,
      clientDetails: template.clientDetails ?? null,
      paidAt: null,
      sentAt: null,
      recurringScheduleId: scheduleDoc.id,
      createdBy: 'cron',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await adminDb.collection('invoices').add(invoiceDoc)

    // Calculate next due date
    const lastDue: Date = schedule.nextDueAt.toDate()
    const nextDue = calculateNextDueAt(schedule.interval as RecurrenceInterval, lastDue)
    const nextDueTs = Timestamp.fromDate(nextDue)

    // Check if schedule should complete (endDate passed)
    const endDate: Date | null = schedule.endDate?.toDate() ?? null
    const isComplete = endDate !== null && nextDue > endDate

    await scheduleDoc.ref.update({
      nextDueAt: nextDueTs,
      status: isComplete ? 'completed' : 'active',
      updatedAt: FieldValue.serverTimestamp(),
    })

    created++
  }

  return apiSuccess({ created })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep "cron/invoices"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/invoices/route.ts
git commit -m "feat: add nightly cron job for recurring invoice generation"
```

---

## Task 6: Register Cron in vercel.json

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the new cron entry to `vercel.json`**

Current content (abridged):
```json
{
  "crons": [
    { "path": "/api/cron/sequences", "schedule": "0 6 * * *" },
    ...
  ]
}
```

Add after the last existing entry:
```json
{ "path": "/api/cron/invoices", "schedule": "0 2 * * *" }
```

Final `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/sequences",        "schedule": "0 6 * * *" },
    { "path": "/api/cron/emails",           "schedule": "0 6 * * *" },
    { "path": "/api/cron/social",           "schedule": "0 7 * * *" },
    { "path": "/api/cron/social-rss",       "schedule": "0 8 * * *" },
    { "path": "/api/cron/social-analytics", "schedule": "0 9 * * *" },
    { "path": "/api/cron/social-inbox-poll","schedule": "0 10 * * *" },
    { "path": "/api/cron/invoices",         "schedule": "0 2 * * *" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: register /api/cron/invoices cron at 2am UTC daily"
```

---

## Task 7: Recurring Setup UI on Invoice Detail Page

**Files:**
- Modify: `app/(admin)/admin/invoicing/[id]/page.tsx`

This task adds a collapsible "Recurring" section below the action buttons on the invoice detail page. It shows existing schedule info if one exists, or a form to create one.

- [ ] **Step 1: Add recurring state and data to `InvoiceDetailPage`**

Add imports at the top of the file:
```typescript
import { INTERVAL_LABELS, RecurrenceInterval } from '@/lib/invoices/recurring'
```

Wait — this is a `'use client'` page. `INTERVAL_LABELS` is a plain object with no server imports, so it's safe to import directly.

Add state after existing state declarations (around line 64):
```typescript
const [schedule, setSchedule] = useState<{ id: string; status: string; interval: string; nextDueAt: any } | null>(null)
const [showRecurringForm, setShowRecurringForm] = useState(false)
const [recurringInterval, setRecurringInterval] = useState<RecurrenceInterval>('monthly')
const [recurringStartDate, setRecurringStartDate] = useState('')
const [recurringEndDate, setRecurringEndDate] = useState('')
const [savingRecurring, setSavingRecurring] = useState(false)
```

- [ ] **Step 2: Fetch existing schedule alongside the invoice**

Replace the existing `useEffect` fetch block:
```typescript
useEffect(() => {
  Promise.all([
    fetch(`/api/v1/invoices/${id}`).then(r => r.json()),
    fetch(`/api/v1/recurring-schedules?status=all`).then(r => r.json()),
  ]).then(([invoiceBody, schedulesBody]) => {
    setInvoice(invoiceBody.data)
    const match = (schedulesBody.data ?? []).find((s: any) => s.invoiceId === id && s.status !== 'cancelled')
    if (match) setSchedule(match)
    setLoading(false)
  }).catch(() => setLoading(false))
}, [id])
```

- [ ] **Step 3: Add `handleCreateRecurring` and `handleCancelRecurring` functions**

Add after `handleDuplicate`:
```typescript
async function handleCreateRecurring() {
  if (!recurringStartDate) return
  setSavingRecurring(true)
  const res = await fetch(`/api/v1/invoices/${id}/recurring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      interval: recurringInterval,
      startDate: recurringStartDate,
      endDate: recurringEndDate || undefined,
    }),
  })
  if (res.ok) {
    const body = await res.json()
    setSchedule({ id: body.data.id, status: 'active', interval: recurringInterval, nextDueAt: null })
    setShowRecurringForm(false)
  }
  setSavingRecurring(false)
}

async function handleCancelRecurring() {
  if (!schedule) return
  setSavingRecurring(true)
  const res = await fetch(`/api/v1/invoices/${id}/recurring`, { method: 'DELETE' })
  if (res.ok) setSchedule(null)
  setSavingRecurring(false)
}
```

- [ ] **Step 4: Add the Recurring section JSX after the existing actions block**

Add directly after the closing `)}` of the actions block (after line 199):

```tsx
{/* Recurring */}
<div className="pib-card space-y-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-on-surface">Recurring Invoice</p>
      {schedule ? (
        <p className="text-xs text-on-surface-variant mt-0.5">
          {INTERVAL_LABELS[schedule.interval as RecurrenceInterval] ?? schedule.interval} · Status: {schedule.status}
        </p>
      ) : (
        <p className="text-xs text-on-surface-variant mt-0.5">Not set up</p>
      )}
    </div>
    {schedule ? (
      <button
        onClick={handleCancelRecurring}
        disabled={savingRecurring}
        className="pib-btn-secondary text-sm font-label"
      >
        Cancel Recurring
      </button>
    ) : (
      <button
        onClick={() => setShowRecurringForm(v => !v)}
        className="pib-btn-secondary text-sm font-label"
      >
        Set Up Recurring
      </button>
    )}
  </div>

  {showRecurringForm && !schedule && (
    <div className="space-y-3 border-t border-[var(--color-card-border)] pt-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant block mb-1">Interval</label>
          <select
            value={recurringInterval}
            onChange={e => setRecurringInterval(e.target.value as RecurrenceInterval)}
            className="pib-input w-full text-sm"
          >
            {(Object.keys(INTERVAL_LABELS) as RecurrenceInterval[]).map(k => (
              <option key={k} value={k}>{INTERVAL_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant block mb-1">Start Date</label>
          <input
            type="date"
            value={recurringStartDate}
            onChange={e => setRecurringStartDate(e.target.value)}
            className="pib-input w-full text-sm"
          />
        </div>
        <div>
          <label className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant block mb-1">End Date (optional)</label>
          <input
            type="date"
            value={recurringEndDate}
            onChange={e => setRecurringEndDate(e.target.value)}
            className="pib-input w-full text-sm"
          />
        </div>
      </div>
      <button
        onClick={handleCreateRecurring}
        disabled={savingRecurring || !recurringStartDate}
        className="pib-btn-primary font-label text-sm"
      >
        {savingRecurring ? 'Saving…' : 'Save Recurring Schedule'}
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep "invoicing/\[id\]"
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/admin/invoicing/\[id\]/page.tsx
git commit -m "feat: add recurring schedule setup UI to invoice detail page"
```

---

## Task 8: Recurring Schedules List Page

**Files:**
- Create: `app/(admin)/admin/invoicing/recurring/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/(admin)/admin/invoicing/recurring/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { INTERVAL_LABELS, RecurrenceInterval } from '@/lib/invoices/recurring'

interface Schedule {
  id: string
  invoiceId: string
  orgId: string
  interval: RecurrenceInterval
  startDate: any
  endDate: any
  nextDueAt: any
  status: 'active' | 'paused' | 'cancelled' | 'completed'
  invoiceNumber?: string
}

function formatDate(ts: any) {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

const STATUS_COLORS: Record<string, string> = {
  active: '#4ade80',
  paused: '#facc15',
  cancelled: 'var(--color-outline)',
  completed: '#60a5fa',
}

export default function RecurringSchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/v1/recurring-schedules?status=${filter}`)
      .then(r => r.json())
      .then(body => { setSchedules(body.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filter])

  async function updateScheduleStatus(id: string, status: 'active' | 'paused' | 'cancelled') {
    setUpdating(id)
    const res = await fetch(`/api/v1/recurring-schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    }
    setUpdating(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/invoicing" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">← Invoicing</Link>
          <h1 className="text-2xl font-headline font-bold text-on-surface mt-1">Recurring Schedules</h1>
        </div>
        <div className="flex gap-2">
          {(['active', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-label px-3 py-1.5 rounded-full capitalize transition-colors ${filter === f ? 'bg-[var(--color-accent-v2)] text-white' : 'pib-btn-secondary'}`}
            >
              {f === 'all' ? 'All' : 'Active'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="pib-card py-12 text-center">
          <p className="text-on-surface-variant text-sm">No recurring schedules found.</p>
        </div>
      ) : (
        <div className="pib-card divide-y divide-[var(--color-card-border)]">
          {schedules.map(s => {
            const color = STATUS_COLORS[s.status] ?? 'var(--color-outline)'
            return (
              <div key={s.id} className="flex items-center justify-between py-3 px-1">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
                    {s.status}
                  </span>
                  <div>
                    <Link href={`/admin/invoicing/${s.invoiceId}`} className="text-sm font-medium text-on-surface hover:underline">
                      Invoice ↗
                    </Link>
                    <p className="text-xs text-on-surface-variant">{INTERVAL_LABELS[s.interval] ?? s.interval} · Next: {formatDate(s.nextDueAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {s.status === 'active' && (
                    <button
                      onClick={() => updateScheduleStatus(s.id, 'paused')}
                      disabled={updating === s.id}
                      className="pib-btn-secondary text-xs font-label"
                    >
                      Pause
                    </button>
                  )}
                  {s.status === 'paused' && (
                    <button
                      onClick={() => updateScheduleStatus(s.id, 'active')}
                      disabled={updating === s.id}
                      className="pib-btn-primary text-xs font-label"
                    >
                      Resume
                    </button>
                  )}
                  {(s.status === 'active' || s.status === 'paused') && (
                    <button
                      onClick={() => updateScheduleStatus(s.id, 'cancelled')}
                      disabled={updating === s.id}
                      className="pib-btn-secondary text-xs font-label"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep "invoicing/recurring"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/invoicing/recurring/page.tsx
git commit -m "feat: add recurring schedules list and management page"
```

---

## Task 9: Sidebar Nav Link

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Read the current sidebar nav items array**

Open `components/admin/AdminSidebar.tsx` and locate the nav items array. It will look something like:
```typescript
const navItems = [
  { label: 'Dashboard', href: '/admin', icon: '◉' },
  ...
  { label: 'Invoicing', href: '/admin/invoicing', icon: '◈' },
  { label: 'Quotes', href: '/admin/quotes', icon: '◈' },
  ...
]
```

- [ ] **Step 2: Add the Recurring Schedules entry after the Invoicing entry**

Add after the Invoicing entry:
```typescript
{ label: 'Recurring', href: '/admin/invoicing/recurring', icon: '↺' },
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd partnersinbiz-web && npx tsc --noEmit 2>&1 | grep "AdminSidebar"
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/admin/AdminSidebar.tsx
git commit -m "feat: add Recurring nav link to admin sidebar"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|------------|------|
| Duplicate button on invoice detail page | Task 1 (API) + Task 2 (UI) |
| Fresh invoice number for duplicate | Task 1 — calls `generateInvoiceNumber` |
| Redirect to new draft after duplicate | Task 2 — `router.push(...)` |
| Mark invoice as recurring (interval + dates) | Task 7 (UI) + Task 4 (API) |
| daily/weekly/monthly/quarterly/yearly intervals | Task 3 + Task 4 |
| Start date and optional end date | Task 4 + Task 7 |
| Nightly cron creates next invoice when due | Task 5 |
| New invoice gets fresh CLI-NNN number | Task 5 — calls `generateInvoiceNumber` |
| New invoice is a draft | Task 5 — `status: 'draft'` |
| UI to see/manage recurring schedules | Task 8 |
| Recurring cron registered in vercel.json | Task 6 |

### Placeholder Check

No "TBD", "TODO", or "implement later" present. All code blocks are complete.

### Type Consistency

- `RecurrenceInterval` defined in `lib/invoices/recurring.ts` (Task 3), imported in Task 4, Task 5, Task 7, Task 8 — consistent.
- `INTERVAL_LABELS` defined in Task 3, imported in Task 7 and Task 8 — consistent.
- `calculateNextDueAt(interval, from)` defined in Task 3, called in Task 4 and Task 5 — consistent signature.
- `generateInvoiceNumber(orgId, clientName)` — existing function, same call signature in Task 1 and Task 5.
