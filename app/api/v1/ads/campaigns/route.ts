// app/api/v1/ads/campaigns/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listCampaigns, createCampaign } from '@/lib/ads/campaigns/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import type { CreateAdCampaignInput, AdEntityStatus } from '@/lib/ads/types'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const url = new URL(req.url)
  const status = url.searchParams.get('status') as AdEntityStatus | null
  const platform = url.searchParams.get('platform') as 'meta' | null

  const campaigns = await listCampaigns({
    orgId,
    status: status ?? undefined,
    platform: platform ?? undefined,
  })

  return apiSuccess(campaigns)
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const ctx = await requireMetaContext(req)
  if (ctx instanceof Response) return ctx

  const body = (await req.json()) as {
    input?: Omit<CreateAdCampaignInput, 'adAccountId'>
  }

  if (!body.input?.name || !body.input?.objective) {
    return apiError('Missing required fields: name, objective', 400)
  }

  const campaign = await createCampaign({
    orgId: ctx.orgId,
    createdBy: (user as { uid?: string }).uid ?? 'unknown',
    input: {
      ...body.input,
      adAccountId: ctx.adAccountId,
    } as CreateAdCampaignInput,
  })

  return apiSuccess(campaign, 201)
})
