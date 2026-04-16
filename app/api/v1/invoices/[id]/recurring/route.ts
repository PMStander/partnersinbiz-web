// app/api/v1/invoices/[id]/recurring/route.ts
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { calculateNextDueAt, RecurrenceInterval } from '@/lib/invoices/recurring'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_INTERVALS: RecurrenceInterval[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

export const POST = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))

  if (!body.interval || !VALID_INTERVALS.includes(body.interval)) {
    return apiError('interval must be one of: daily, weekly, monthly, quarterly, yearly', 400)
  }
  if (!body.startDate) return apiError('startDate is required', 400)

  const invoiceDoc = await adminDb.collection('invoices').doc(id).get()
  if (!invoiceDoc.exists) return apiError('Invoice not found', 404)
  const invoice = invoiceDoc.data()!

  // Check for existing active/paused schedule
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

export const DELETE = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params

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
