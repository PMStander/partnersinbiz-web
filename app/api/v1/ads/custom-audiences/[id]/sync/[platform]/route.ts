// app/api/v1/ads/custom-audiences/[id]/sync/[platform]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCustomAudience, setCustomAudienceMetaId } from '@/lib/ads/custom-audiences/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import { isAdPlatform } from '@/lib/ads/types'

export const POST = withAuth(
  'admin',
  async (
    req: NextRequest,
    _user: unknown,
    ctxParams: { params: Promise<{ id: string; platform: string }> },
  ) => {
    const { id, platform } = await ctxParams.params

    if (!isAdPlatform(platform)) return apiError(`Unsupported platform: ${platform}`, 400)

    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const ca = await getCustomAudience(id)
    if (!ca || ca.orgId !== orgId) return apiError('Custom audience not found', 404)

    if (platform !== 'meta') {
      // Phase 4 only wires Meta; other platforms not yet implemented
      return apiError(`Platform ${platform} sync not implemented yet`, 501)
    }

    const ctx = await requireMetaContext(req)
    if (ctx instanceof Response) return ctx

    const existingMetaCaId = ca.providerData?.meta?.customAudienceId

    if (!existingMetaCaId) {
      // No metaCaId yet — create on Meta
      const result = (await metaProvider.customAudienceCRUD!({
        op: 'create',
        accessToken: ctx.accessToken,
        adAccountId: ctx.adAccountId,
        ca,
      })) as { metaCaId: string }
      await setCustomAudienceMetaId(ca.id, result.metaCaId)
      return apiSuccess({
        platform: 'meta',
        metaCaId: result.metaCaId,
        alreadySynced: false,
      })
    }

    // metaCaId exists — update name/description on Meta
    await metaProvider.customAudienceCRUD!({
      op: 'update',
      accessToken: ctx.accessToken,
      metaCaId: existingMetaCaId,
      patch: { name: ca.name, description: ca.description },
    })
    return apiSuccess({
      platform: 'meta',
      metaCaId: existingMetaCaId,
      alreadySynced: true,
    })
  },
)
