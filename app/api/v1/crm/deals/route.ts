/**
 * GET  /api/v1/crm/deals  — list deals
 * POST /api/v1/crm/deals  — create deal
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Deal, DealInput, DealStage, Currency } from '@/lib/crm/types'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

const VALID_STAGES: DealStage[] = ['discovery', 'proposal', 'negotiation', 'won', 'lost']
const VALID_CURRENCIES: Currency[] = ['USD', 'EUR', 'ZAR']

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const stage = searchParams.get('stage') as DealStage | null
  const contactId = searchParams.get('contactId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('deals').orderBy('createdAt', 'desc')
  if (stage && VALID_STAGES.includes(stage)) query = query.where('stage', '==', stage)
  if (contactId) query = query.where('contactId', '==', contactId)

  const snapshot = await query
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  const deals: Deal[] = snapshot.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((d: Deal) => d.deleted !== true)
  return apiSuccess(deals, 200, { total: deals.length, page, limit })
})

export const POST = withAuth('admin', async (req) => {
  const body = await req.json() as DealInput
  if (!body.title?.trim()) return apiError('Title is required')
  if (!body.contactId?.trim()) return apiError('contactId is required')
  if (body.stage && !VALID_STAGES.includes(body.stage)) return apiError('Invalid stage')
  if (body.currency && !VALID_CURRENCIES.includes(body.currency))
    return apiError('Invalid currency — use USD, EUR, or ZAR')

  const orgId = typeof (body as { orgId?: unknown }).orgId === 'string'
    ? ((body as { orgId?: string }).orgId as string).trim()
    : ''
  if (!orgId) return apiError('orgId is required — deals must belong to an organisation so webhooks and pipeline reports work', 400)

  const docRef = await adminDb.collection('deals').add({
    orgId,
    contactId: body.contactId.trim(),
    title: body.title.trim(),
    value: body.value ?? 0,
    currency: body.currency ?? 'USD',
    stage: body.stage ?? 'discovery',
    expectedCloseDate: body.expectedCloseDate ?? null,
    notes: body.notes?.trim() ?? '',
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  try {
    await dispatchWebhook(orgId, 'deal.created', {
      id: docRef.id,
      title: body.title.trim(),
      value: body.value ?? 0,
      stage: body.stage ?? 'discovery',
      contactId: body.contactId.trim(),
    })
  } catch (err) {
    console.error('[webhook-dispatch-error] deal.created', err)
  }

  return apiSuccess({ id: docRef.id }, 201)
})
