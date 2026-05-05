import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const snap = await adminDb.collection('seo_sprints').doc(id).get()
    if (!snap.exists) return apiError('Sprint not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
    return apiSuccess({
      health: data.health ?? { score: null, signals: [] },
      integrations: {
        gsc: {
          connected: data.integrations?.gsc?.connected ?? false,
          tokenStatus: data.integrations?.gsc?.tokenStatus ?? 'unknown',
          lastPullAt: data.integrations?.gsc?.lastPullAt ?? null,
        },
        bing: {
          connected: data.integrations?.bing?.connected ?? false,
          tokenStatus: data.integrations?.bing?.tokenStatus ?? 'unknown',
          lastPullAt: data.integrations?.bing?.lastPullAt ?? null,
        },
        pagespeed: {
          enabled: data.integrations?.pagespeed?.enabled ?? false,
          lastPullAt: data.integrations?.pagespeed?.lastPullAt ?? null,
        },
      },
    })
  },
)
