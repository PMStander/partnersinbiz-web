// app/api/v1/ads/ads/[id]/validate/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAd } from '@/lib/ads/ads/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { validateAd as metaValidateAd } from '@/lib/ads/providers/meta/ads'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    const ctx = await requireMetaContext(req)
    if (ctx instanceof Response) return ctx

    const metaId = (ad.providerData?.meta as { id?: string } | undefined)?.id
    if (!metaId) {
      // Not yet pushed to Meta — nothing to validate against
      return apiSuccess({
        valid: true,
        warnings: ['Ad not yet pushed to Meta — nothing to validate against'],
      })
    }

    try {
      await metaValidateAd({
        metaAdId: metaId,
        accessToken: ctx.accessToken,
        patch: ad,
      })
      return apiSuccess({ valid: true, warnings: [] })
    } catch (err) {
      return apiSuccess({ valid: false, warnings: [(err as Error).message] })
    }
  },
)
