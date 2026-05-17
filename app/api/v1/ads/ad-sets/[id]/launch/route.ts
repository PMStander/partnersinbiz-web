// app/api/v1/ads/ad-sets/[id]/launch/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAdSet, updateAdSet, setAdSetMetaId } from '@/lib/ads/adsets/store'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import { logAdSetActivity } from '@/lib/ads/activity'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const adSet = await getAdSet(id)
    if (!adSet || adSet.orgId !== orgId) return apiError('Ad set not found', 404)

    const ctx = await requireMetaContext(req)
    if (ctx instanceof Response) return ctx

    // Resolve parent campaign's Meta ID — required for Meta ad set creation
    const campaign = await getCampaign(adSet.campaignId)
    const metaCampaignId = (campaign?.providerData?.meta as { id?: string } | undefined)?.id
    if (!metaCampaignId) {
      return apiError('Parent campaign not yet on Meta — launch the campaign first', 400)
    }

    // Set status ACTIVE locally; metaProvider.upsertAdSet will create OR update
    await updateAdSet(id, { status: 'ACTIVE' })

    const result = (await metaProvider.upsertAdSet!({
      accessToken: ctx.accessToken,
      adAccountId: ctx.adAccountId,
      adSet: { ...adSet, status: 'ACTIVE' } as any,
      metaCampaignId,
    })) as { metaAdSetId: string; created: boolean }

    if (result.created) {
      await setAdSetMetaId(id, result.metaAdSetId)
    }

    const actor = {
      id: (user as { uid?: string }).uid ?? 'unknown',
      name: (user as { email?: string }).email ?? 'Admin',
      role: 'admin' as const,
    }
    await logAdSetActivity({
      orgId,
      actor,
      action: 'launched',
      adSetId: id,
      adSetName: adSet.name,
      campaignName: campaign?.name,
    })

    const updated = await getAdSet(id)
    return apiSuccess(updated)
  },
)
