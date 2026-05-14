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
import { tryAttributeDealWon } from '@/lib/email-analytics/attribution-hooks'
import { logActivity } from '@/lib/activity/log'

type Params = { params: Promise<{ id: string }> }

export const PUT = withAuth('admin', async (req, user, context) => {
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
      // Best-effort revenue attribution back to the most recent email click.
      const contactId =
        (typeof body?.contactId === 'string' && body.contactId) ||
        (typeof before.contactId === 'string' && before.contactId) ||
        null
      const currency =
        (typeof body?.currency === 'string' && body.currency) ||
        (typeof before.currency === 'string' && before.currency) ||
        'ZAR'
      await tryAttributeDealWon({
        orgId,
        contactId,
        dealId: id,
        amount: typeof value === 'number' ? value : 0,
        currency,
      })
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

  if (orgId) {
    const dealTitle = (typeof body?.title === 'string' && body.title) ||
      (typeof before.title === 'string' && before.title) || undefined
    const newStage = typeof body.stage === 'string' ? body.stage : undefined
    const actorRole = user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client'

    if (newStage === 'won') {
      logActivity({
        orgId,
        type: 'crm_deal_won',
        actorId: user.uid,
        actorName: user.uid,
        actorRole,
        description: `Deal won: "${dealTitle ?? id}"`,
        entityId: id,
        entityType: 'deal',
        entityTitle: dealTitle,
      }).catch(() => {})
    } else if (newStage === 'lost') {
      logActivity({
        orgId,
        type: 'crm_deal_lost',
        actorId: user.uid,
        actorName: user.uid,
        actorRole,
        description: `Deal lost: "${dealTitle ?? id}"`,
        entityId: id,
        entityType: 'deal',
        entityTitle: dealTitle,
      }).catch(() => {})
    } else {
      logActivity({
        orgId,
        type: 'crm_deal_updated',
        actorId: user.uid,
        actorName: user.uid,
        actorRole,
        description: 'Updated deal',
        entityId: id,
        entityType: 'deal',
        entityTitle: dealTitle,
      }).catch(() => {})
    }
  }

  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (_req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('deals').doc(id).get()
  if (!doc.exists) return apiError('Deal not found', 404)
  const existing = doc.data() ?? {}
  await adminDb.collection('deals').doc(id).update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })

  const orgId = typeof existing.orgId === 'string' ? existing.orgId : undefined
  if (orgId) {
    logActivity({
      orgId,
      type: 'crm_deal_deleted',
      actorId: user.uid,
      actorName: user.uid,
      actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
      description: 'Deleted deal',
      entityId: id,
      entityType: 'deal',
    }).catch(() => {})
  }

  return apiSuccess({ id })
})
