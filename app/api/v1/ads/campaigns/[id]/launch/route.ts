// app/api/v1/ads/campaigns/[id]/launch/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCampaign, updateCampaign, setCampaignMetaId } from '@/lib/ads/campaigns/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const campaign = await getCampaign(id)
    if (!campaign || campaign.orgId !== orgId) return apiError('Campaign not found', 404)

    const ctx = await requireMetaContext(req)
    if (ctx instanceof Response) return ctx

    // Set status ACTIVE locally; metaProvider.upsertCampaign will create OR update
    await updateCampaign(id, { status: 'ACTIVE' })

    const result = (await metaProvider.upsertCampaign!({
      accessToken: ctx.accessToken,
      adAccountId: ctx.adAccountId,
      campaign: { ...campaign, status: 'ACTIVE' } as any,
    })) as { metaCampaignId: string; created: boolean }

    if (result.created) {
      await setCampaignMetaId(id, result.metaCampaignId)
    }

    const updated = await getCampaign(id)
    return apiSuccess(updated)
  },
)
