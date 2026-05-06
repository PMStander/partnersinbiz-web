/**
 * GET  /api/v1/campaigns?orgId=...&status=...   — list campaigns for an org
 * POST /api/v1/campaigns                        — create a draft campaign
 *
 * Auth: admin
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { EMPTY_STATS, type Campaign, type CampaignStatus } from '@/lib/campaigns/types'
import type { ApiUser } from '@/lib/api/types'

const VALID_STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'active', 'paused', 'completed']

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId
  const status = searchParams.get('status') as CampaignStatus | null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('campaigns')
    .where('orgId', '==', orgId)
    .orderBy('createdAt', 'desc')
  if (status && VALID_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }

  const snap = await query.get()
  const campaigns: Campaign[] = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }) as Campaign)
    .filter((c: Campaign) => c.deleted !== true)

  return apiSuccess(campaigns)
})

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return apiError('name is required', 400)

  const sequenceId = typeof body.sequenceId === 'string' ? body.sequenceId.trim() : ''
  // Validate that the referenced sequence (if any) belongs to the same org
  if (sequenceId) {
    const seqSnap = await adminDb.collection('sequences').doc(sequenceId).get()
    if (!seqSnap.exists) return apiError('sequenceId not found', 400)
    if (seqSnap.data()?.orgId && seqSnap.data()?.orgId !== orgId) {
      return apiError('sequenceId belongs to a different organisation', 403)
    }
  }

  const docRef = await adminDb.collection('campaigns').add({
    orgId,
    name,
    description: body.description ?? '',
    status: 'draft',
    fromDomainId: body.fromDomainId ?? '',
    fromName: body.fromName ?? '',
    fromLocal: body.fromLocal ?? 'campaigns',
    replyTo: body.replyTo ?? '',
    segmentId: body.segmentId ?? '',
    contactIds: Array.isArray(body.contactIds) ? body.contactIds : [],
    sequenceId,
    triggers: {
      captureSourceIds: Array.isArray(body.triggers?.captureSourceIds) ? body.triggers.captureSourceIds : [],
      tags: Array.isArray(body.triggers?.tags) ? body.triggers.tags : [],
    },
    startAt: null,
    endAt: null,
    stats: EMPTY_STATS,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: user.uid,
    deleted: false,
  })

  return apiSuccess({ id: docRef.id }, 201)
})
