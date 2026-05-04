import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth(
  'admin',
  withIdempotency(async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const ref = adminDb.collection('seo_optimizations').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Optimization not found', 404)
    await ref.update({ status: 'rejected', ...lastActorFrom(user) })
    return apiSuccess({ id, rejected: true })
  }),
)
