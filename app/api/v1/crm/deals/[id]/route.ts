/**
 * PUT    /api/v1/crm/deals/:id  — update deal
 * DELETE /api/v1/crm/deals/:id  — soft delete
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

type Params = { params: Promise<{ id: string }> }

export const PUT = withAuth('admin', async (req, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('deals').doc(id).get()
  if (!doc.exists) return apiError('Deal not found', 404)
  const body = await req.json()
  const before = doc.data() ?? {}

  await adminDb.collection('deals').doc(id).update({ ...body, updatedAt: FieldValue.serverTimestamp() })

  const orgId =
    (typeof body?.orgId === 'string' && body.orgId) ||
    (typeof before.orgId === 'string' && before.orgId) ||
    undefined

  // Detect stage change. body.stage present + different from before.stage.
  if (orgId && typeof body.stage === 'string' && body.stage !== before.stage) {
    const fromStage = before.stage
    const toStage = body.stage
    const value = typeof body.value === 'number' ? body.value : before.value
    try {
      await dispatchWebhook(orgId, 'deal.stage_changed', { id, fromStage, toStage, value })
    } catch (err) {
      console.error('[webhook-dispatch-error] deal.stage_changed', err)
    }
    if (toStage === 'won') {
      try {
        await dispatchWebhook(orgId, 'deal.won', { id, fromStage, toStage, value })
      } catch (err) {
        console.error('[webhook-dispatch-error] deal.won', err)
      }
    } else if (toStage === 'lost') {
      try {
        await dispatchWebhook(orgId, 'deal.lost', { id, fromStage, toStage, value })
      } catch (err) {
        console.error('[webhook-dispatch-error] deal.lost', err)
      }
    }
  } else if (!orgId && typeof body.stage === 'string' && body.stage !== before.stage) {
    console.warn('[webhook-dispatch-skip] deal stage change — no orgId on deal', id)
  }

  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('deals').doc(id).get()
  if (!doc.exists) return apiError('Deal not found', 404)
  await adminDb.collection('deals').doc(id).update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})
