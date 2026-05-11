// app/api/v1/broadcasts/[id]/preflight/route.ts
//
// POST — run the pre-send preflight checklist against this broadcast.
// Renders the template (if any), resolves the sender, then runs ~20 quality
// checks: subject length, broken links, missing alt text, contrast, etc.
//
// This route never schedules or sends — it's purely a quality report.
// Auth: client.
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runPreflight } from '@/lib/email/preflight'
import { preflightInputForBroadcast } from '@/lib/email/preflight-source'
import type { Broadcast } from '@/lib/broadcasts/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params

  const ref = adminDb.collection('broadcasts').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Broadcast not found', 404)
  const broadcast = { id: snap.id, ...snap.data() } as Broadcast
  const scope = resolveOrgScope(user, broadcast.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const input = await preflightInputForBroadcast(broadcast)
  const report = await runPreflight(input)
  return apiSuccess({ broadcastId: id, report })
})
