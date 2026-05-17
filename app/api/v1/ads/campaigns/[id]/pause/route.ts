// app/api/v1/ads/campaigns/[id]/pause/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCampaign, updateCampaign } from '@/lib/ads/campaigns/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import { logCampaignActivity } from '@/lib/ads/activity'
import { notifyCampaignPaused } from '@/lib/ads/notifications'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const campaign = await getCampaign(id)
    if (!campaign || campaign.orgId !== orgId) return apiError('Campaign not found', 404)

    await updateCampaign(id, { status: 'PAUSED' })

    // Best-effort Meta sync — only if campaign is already pushed to Meta
    const metaId = (campaign.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaProvider.upsertCampaign!({
            accessToken: ctx.accessToken,
            adAccountId: ctx.adAccountId,
            campaign: { ...campaign, status: 'PAUSED' } as any,
          })
        } catch {
          // Status already updated locally; Meta sync failure is non-blocking
        }
      }
    }

    const actor = {
      id: (user as { uid?: string }).uid ?? 'unknown',
      name: (user as { email?: string }).email ?? 'Admin',
      role: 'admin' as const,
    }
    await logCampaignActivity({
      orgId,
      actor,
      action: 'paused',
      campaignId: id,
      campaignName: campaign.name,
    })
    const orgSlug = req.headers.get('X-Org-Slug') ?? ''
    if (orgSlug) {
      await notifyCampaignPaused({
        orgId,
        orgSlug,
        campaignId: id,
        campaignName: campaign.name,
      })
    }

    const updated = await getCampaign(id)
    return apiSuccess(updated)
  },
)
