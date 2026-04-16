/**
 * GET  /api/v1/expenses — list expenses (filterable, paginated)
 * POST /api/v1/expenses — create an expense (idempotent via Idempotency-Key header)
 *
 * Auth: admin (AI/admin)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { actorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  VALID_EXPENSE_STATUSES,
  type Expense,
  type ExpenseInput,
  type ExpenseStatus,
} from '@/lib/expenses/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)

  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required; pass it as a query param')

  const userId = searchParams.get('userId')
  const status = searchParams.get('status') as ExpenseStatus | null
  const category = searchParams.get('category')
  const projectId = searchParams.get('projectId')
  const clientOrgId = searchParams.get('clientOrgId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const billableParam = searchParams.get('billable')
  const billedParam = searchParams.get('billed')

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  if (status && !VALID_EXPENSE_STATUSES.includes(status)) {
    return apiError(
      `Invalid status; expected one of: ${VALID_EXPENSE_STATUSES.join(', ')}`,
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection('expenses')
    .where('orgId', '==', orgId)

  if (status) query = query.where('status', '==', status)
  if (userId) query = query.where('userId', '==', userId)
  if (category) query = query.where('category', '==', category)
  if (projectId) query = query.where('projectId', '==', projectId)
  if (clientOrgId) query = query.where('clientOrgId', '==', clientOrgId)

  if (billableParam !== null) {
    query = query.where('billable', '==', billableParam === 'true')
  }

  if (billedParam !== null) {
    // billed = has invoiceId
    if (billedParam === 'true') {
      query = query.where('invoiceId', '!=', null)
    } else {
      query = query.where('invoiceId', '==', null)
    }
  }

  if (from) query = query.where('date', '>=', from)
  if (to) query = query.where('date', '<=', to)

  query = query.orderBy('date', 'desc')

  const snapshot = await query
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  const expenses: Expense[] = snapshot.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((e: Expense) => e.deleted !== true)

  return apiSuccess(expenses, 200, {
    total: expenses.length,
    page,
    limit,
  })
})

export const POST = withAuth(
  'admin',
  withIdempotency(async (req, user) => {
    const body = (await req.json().catch(() => ({}))) as ExpenseInput & {
      orgId?: string
    }

    if (!body.orgId?.trim()) return apiError('orgId is required')
    if (!body.date) return apiError('date is required (ISO string)')
    if (body.amount === undefined || body.amount === null) {
      return apiError('amount is required')
    }
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
      return apiError('amount must be a number')
    }
    if (body.amount <= 0) return apiError('amount must be greater than 0')
    if (!body.category?.trim()) return apiError('category is required')

    const doc = {
      orgId: body.orgId.trim(),
      userId: body.userId?.trim() || user.uid,
      date: body.date,
      amount: body.amount,
      currency: body.currency?.trim() || 'ZAR',
      category: body.category.trim(),
      description: body.description?.trim() ?? '',
      vendor: body.vendor?.trim() ?? '',
      receiptFileId: body.receiptFileId ?? null,
      projectId: body.projectId ?? null,
      clientOrgId: body.clientOrgId ?? null,
      billable: body.billable ?? false,
      reimbursable: body.reimbursable ?? true,
      status: 'draft' as ExpenseStatus,
      invoiceId: null,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      ...actorFrom(user),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deleted: false,
    }

    const ref = await adminDb.collection('expenses').add(doc)
    return apiSuccess({ id: ref.id }, 201)
  }),
)
