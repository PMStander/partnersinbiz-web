/**
 * GET /api/v1/broadcasts/[id]/preview — resolved audience size + first 5 sample contacts.
 *
 * Lets the operator sanity-check who they're about to email before they
 * hit "Schedule" or "Send now".
 *
 * Auth: client.
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { resolveBroadcastAudience } from '@/lib/broadcasts/audience'
import type { Broadcast } from '@/lib/broadcasts/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('broadcasts').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Broadcast not found', 404)
  const current = { id: snap.id, ...snap.data() } as Broadcast
  const scope = resolveOrgScope(user, current.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const audienceContacts = await resolveBroadcastAudience(current.orgId, current.audience)
  const sampleContacts = audienceContacts.slice(0, 5).map((c) => ({
    email: c.email,
    name: c.name ?? '',
    company: c.company ?? '',
  }))

  return apiSuccess({
    audienceSize: audienceContacts.length,
    sampleContacts,
  })
})
