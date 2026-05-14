/**
 * POST /api/v1/campaigns/[id]/launch — set status=active, resolve audience,
 *      enroll matching contacts in the campaign's sequence.
 *
 * Auth: admin
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Campaign } from '@/lib/campaigns/types'
import type { Sequence } from '@/lib/sequences/types'
import type { Contact } from '@/lib/crm/types'
import { resolveSegmentContacts } from '@/lib/crm/segments'
import type { ApiUser } from '@/lib/api/types'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'
import { logActivity } from '@/lib/activity/log'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params

  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Campaign not found', 404)
  const campaign = { id: snap.id, ...snap.data() } as Campaign

  const scope = resolveOrgScope(user, campaign.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  if (campaign.status === 'active') return apiError('Campaign is already active', 422)
  if (campaign.status === 'completed') return apiError('Campaign is already completed', 422)
  if (!campaign.sequenceId) return apiError('Campaign has no sequence — set sequenceId first', 422)
  if (!campaign.segmentId && (!campaign.contactIds || campaign.contactIds.length === 0)) {
    return apiError('Campaign has no audience — set segmentId or contactIds first', 422)
  }

  // Load + validate the sequence
  const seqSnap = await adminDb.collection('sequences').doc(campaign.sequenceId).get()
  if (!seqSnap.exists || seqSnap.data()?.deleted) return apiError('Sequence not found', 422)
  const sequence = { id: seqSnap.id, ...seqSnap.data() } as Sequence
  if (sequence.orgId !== campaign.orgId) return apiError('Sequence belongs to a different org', 403)
  if (!sequence.steps?.length) return apiError('Sequence has no steps', 422)

  // Resolve audience to a contact-id list
  let contactIds: string[] = []
  if (campaign.segmentId) {
    const segSnap = await adminDb.collection('segments').doc(campaign.segmentId).get()
    if (!segSnap.exists || segSnap.data()?.deleted) return apiError('Segment not found', 422)
    if (segSnap.data()?.orgId !== campaign.orgId) {
      return apiError('Segment belongs to a different org', 403)
    }
    const filters = segSnap.data()?.filters ?? {}
    const contacts = await resolveSegmentContacts(campaign.orgId, filters)
    contactIds = contacts.map((c: Contact) => c.id)
  } else {
    contactIds = [...campaign.contactIds]
  }

  if (contactIds.length === 0) {
    return apiError('Audience is empty — campaign has no contacts to enroll', 422)
  }

  // Compute first-step delay
  const firstStep = sequence.steps[0]
  const delayMs = (firstStep.delayDays ?? 0) * 24 * 60 * 60 * 1000
  const nextSendAt = Timestamp.fromDate(new Date(Date.now() + delayMs))

  // Enroll contacts. Skip cross-org leakage; skip already-enrolled contacts in this campaign.
  let enrolledCount = 0
  for (const contactId of contactIds) {
    const cSnap = await adminDb.collection('contacts').doc(contactId).get()
    if (!cSnap.exists) continue
    const c = cSnap.data() as Contact
    if (c.deleted || c.orgId !== campaign.orgId) continue
    if (c.unsubscribedAt || c.bouncedAt) continue

    // Idempotency: skip if already enrolled in this campaign
    const existing = await adminDb.collection('sequence_enrollments')
      .where('campaignId', '==', campaign.id)
      .where('contactId', '==', contactId)
      .limit(1)
      .get()
    if (!existing.empty) continue

    await adminDb.collection('sequence_enrollments').add({
      orgId: campaign.orgId,
      campaignId: campaign.id,
      sequenceId: sequence.id,
      contactId,
      status: 'active',
      currentStep: 0,
      enrolledAt: FieldValue.serverTimestamp(),
      nextSendAt,
      deleted: false,
    })

    await adminDb.collection('activities').add({
      orgId: campaign.orgId,
      contactId,
      type: 'sequence_enrolled',
      summary: `Enrolled in campaign: ${campaign.name}`,
      metadata: { campaignId: campaign.id, sequenceId: sequence.id },
      createdAt: FieldValue.serverTimestamp(),
    })

    enrolledCount++
  }

  await snap.ref.update({
    status: 'active',
    startAt: FieldValue.serverTimestamp(),
    'stats.enrolled': FieldValue.increment(enrolledCount),
    updatedAt: FieldValue.serverTimestamp(),
  })

  try {
    await dispatchWebhook(campaign.orgId, 'campaign.launched', {
      id: campaign.id,
      name: campaign.name,
      enrolled: enrolledCount,
      audienceSize: contactIds.length,
    })
  } catch (err) {
    console.error('[webhook-dispatch-error] campaign.launched', err)
  }

  logActivity({
    orgId: campaign.orgId,
    type: 'campaign_launched',
    actorId: user.uid,
    actorName: user.uid,
    actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    description: 'Launched campaign',
    entityId: campaign.id,
    entityType: 'campaign',
    entityTitle: campaign.name ?? undefined,
  }).catch(() => {})

  return apiSuccess({ enrolled: enrolledCount, audienceSize: contactIds.length })
})
