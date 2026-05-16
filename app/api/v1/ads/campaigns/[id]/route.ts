// app/api/v1/ads/campaigns/[id]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCampaign, updateCampaign, deleteCampaign } from '@/lib/ads/campaigns/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import { deleteCampaign as metaDeleteCampaign } from '@/lib/ads/providers/meta/campaigns'
import type { UpdateAdCampaignInput } from '@/lib/ads/types'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const campaign = await getCampaign(id)

    if (!campaign) return apiError('Campaign not found', 404)
    if (campaign.orgId !== orgId) return apiError('Campaign not found', 404) // tenant isolation

    return apiSuccess(campaign)
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const campaign = await getCampaign(id)
    if (!campaign || campaign.orgId !== orgId) return apiError('Campaign not found', 404)

    const patch = (await req.json()) as UpdateAdCampaignInput
    await updateCampaign(id, patch)

    // If campaign is live in Meta, push the update upstream
    const warnings: string[] = []
    const metaId = (campaign.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaProvider.upsertCampaign!({
            accessToken: ctx.accessToken,
            adAccountId: ctx.adAccountId,
            campaign: { ...campaign, ...patch } as any,
          })
        } catch (err) {
          warnings.push(`Meta sync warning: ${(err as Error).message}`)
        }
      }
    }

    const updated = await getCampaign(id)
    const responseData = warnings.length ? { ...updated, warnings } : updated
    return apiSuccess(responseData)
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const campaign = await getCampaign(id)
    if (!campaign || campaign.orgId !== orgId) return apiError('Campaign not found', 404)

    // Best-effort delete from Meta first
    const metaId = (campaign.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaDeleteCampaign({ metaCampaignId: metaId, accessToken: ctx.accessToken })
        } catch {
          // swallow — local delete is source of truth
        }
      }
    }

    await deleteCampaign(id)
    return apiSuccess({ deleted: true })
  },
)
