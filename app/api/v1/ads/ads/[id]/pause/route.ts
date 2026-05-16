// app/api/v1/ads/ads/[id]/pause/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAd, updateAd } from '@/lib/ads/ads/store'
import { getAdSet } from '@/lib/ads/adsets/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    await updateAd(id, { status: 'PAUSED' })

    // Best-effort Meta sync — only if ad is already pushed to Meta
    const metaId = (ad.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          // Resolve parent ad set's metaAdSetId for the upsert call
          const adSet = await getAdSet(ad.adSetId)
          const metaAdSetId =
            (adSet?.providerData?.meta as { id?: string } | undefined)?.id ?? ''
          const pageId = req.headers.get('X-Page-Id') ?? ''

          await metaProvider.upsertAd!({
            accessToken: ctx.accessToken,
            adAccountId: ctx.adAccountId,
            ad: { ...ad, status: 'PAUSED' } as any,
            metaAdSetId,
            pageId,
          })
        } catch {
          // Status already updated locally; Meta sync failure is non-blocking
        }
      }
    }

    const updated = await getAd(id)
    return apiSuccess(updated)
  },
)
