// app/api/v1/ads/ad-sets/[id]/validate/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAdSet } from '@/lib/ads/adsets/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { validateAdSet as metaValidateAdSet } from '@/lib/ads/providers/meta/adsets'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const adSet = await getAdSet(id)
    if (!adSet || adSet.orgId !== orgId) return apiError('Ad set not found', 404)

    const ctx = await requireMetaContext(req)
    if (ctx instanceof Response) return ctx

    const metaId = (adSet.providerData?.meta as { id?: string } | undefined)?.id
    if (!metaId) {
      // Not yet pushed to Meta — nothing to validate against
      return apiSuccess({
        valid: true,
        warnings: ['Ad set not yet pushed to Meta — nothing to validate against'],
      })
    }

    try {
      await metaValidateAdSet({
        metaAdSetId: metaId,
        accessToken: ctx.accessToken,
        patch: adSet,
      })
      return apiSuccess({ valid: true, warnings: [] })
    } catch (err) {
      return apiSuccess({ valid: false, warnings: [(err as Error).message] })
    }
  },
)
