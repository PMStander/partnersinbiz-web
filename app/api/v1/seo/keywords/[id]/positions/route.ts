import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const since = new URL(req.url).searchParams.get('since')
    const snap = await adminDb.collection('seo_keywords').doc(id).get()
    if (!snap.exists) return apiError('Keyword not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
    let positions = data.positions ?? []
    if (since) {
      const sinceMs = new Date(since).getTime()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      positions = positions.filter((p: any) => new Date(p.pulledAt).getTime() >= sinceMs)
    }
    return apiSuccess(positions)
  },
)
