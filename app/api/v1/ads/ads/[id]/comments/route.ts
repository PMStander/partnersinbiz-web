// app/api/v1/ads/ads/[id]/comments/route.ts
//
// Admin-side per-ad comment list. Read-only here — admins reply by hitting the
// same portal POST as members would, or via the (future) admin reply route.
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAd } from '@/lib/ads/ads/store'
import { listComments } from '@/lib/ads/comments'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user, context?: Ctx) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    if (!context?.params) return apiError('Missing route params', 400)
    const { id } = await context.params

    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    const comments = await listComments({ orgId, adId: id })
    return apiSuccess(comments)
  },
)
