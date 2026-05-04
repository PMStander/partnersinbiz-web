import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth(
  'admin',
  withIdempotency(async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const force = new URL(req.url).searchParams.get('force') === 'true'
    const ref = adminDb.collection('seo_sprints').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Sprint not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
    await ref.update({
      status: 'archived',
      deleted: force,
      deletedAt: force ? FieldValue.serverTimestamp() : null,
      ...lastActorFrom(user),
    })
    return apiSuccess({ id, archived: true, deleted: force })
  }),
)
