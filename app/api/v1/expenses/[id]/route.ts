/**
 * GET    /api/v1/expenses/:id — fetch a single expense
 * PUT    /api/v1/expenses/:id — update an expense (only while draft/submitted + not billed)
 * DELETE /api/v1/expenses/:id — soft delete (reject if billed or approved/reimbursed)
 *
 * Auth: admin (AI/admin)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { lastActorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  EDITABLE_EXPENSE_STATUSES,
  type Expense,
} from '@/lib/expenses/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params
  const doc = await adminDb.collection('expenses').doc(id).get()
  if (!doc.exists) return apiError('Expense not found', 404)
  const data = doc.data() as Expense | undefined
  if (!data || data.deleted === true) return apiError('Expense not found', 404)
  const { id: _dataId, ...rest } = data as Expense
  void _dataId
  return apiSuccess({ id: doc.id, ...rest })
})

// Fields that can be edited via PUT.
const UPDATABLE_FIELDS = [
  'userId',
  'date',
  'amount',
  'currency',
  'category',
  'description',
  'vendor',
  'receiptFileId',
  'projectId',
  'clientOrgId',
  'billable',
  'reimbursable',
] as const

export const PUT = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('expenses').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Expense not found', 404)
  const existing = doc.data() as Expense | undefined
  if (!existing || existing.deleted === true) {
    return apiError('Expense not found', 404)
  }

  // Reject edits when the entry is locked (approved/reimbursed/rejected) or already billed.
  if (!EDITABLE_EXPENSE_STATUSES.includes(existing.status)) {
    return apiError(
      `Cannot edit an expense in status '${existing.status}'; only draft or submitted expenses are editable`,
      409,
    )
  }
  if (existing.invoiceId) {
    return apiError(
      'Cannot edit an expense that has already been billed to an invoice',
      409,
    )
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  if (
    body.amount !== undefined &&
    (typeof body.amount !== 'number' ||
      !Number.isFinite(body.amount) ||
      body.amount <= 0)
  ) {
    return apiError('amount must be a number greater than 0')
  }

  const updates: Record<string, unknown> = {}
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return apiError('No updatable fields provided')
  }

  await ref.update({
    ...updates,
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, ...updates })
})

export const DELETE = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('expenses').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Expense not found', 404)
  const existing = doc.data() as Expense | undefined
  if (!existing || existing.deleted === true) {
    return apiError('Expense not found', 404)
  }

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  // Reject deletion once billed or in a locked post-approval state.
  if (existing.invoiceId) {
    return apiError(
      'Cannot delete an expense that has already been billed to an invoice',
      409,
    )
  }
  if (
    existing.status === 'approved' ||
    existing.status === 'reimbursed'
  ) {
    return apiError(
      `Cannot delete an expense in status '${existing.status}'`,
      409,
    )
  }

  if (force) {
    await ref.delete()
  } else {
    await ref.update({
      deleted: true,
      ...lastActorFrom(user),
    })
  }

  return apiSuccess({ id, deleted: true })
})
