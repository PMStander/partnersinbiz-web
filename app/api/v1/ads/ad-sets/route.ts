// app/api/v1/ads/ad-sets/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listAdSets, createAdSet } from '@/lib/ads/adsets/store'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import type { CreateAdSetInput, AdEntityStatus } from '@/lib/ads/types'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const url = new URL(req.url)
  const status = url.searchParams.get('status') as AdEntityStatus | null
  const campaignId = url.searchParams.get('campaignId')

  const adSets = await listAdSets({
    orgId,
    status: status ?? undefined,
    campaignId: campaignId ?? undefined,
  })

  return apiSuccess(adSets)
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const ctx = await requireMetaContext(req)
  if (ctx instanceof Response) return ctx

  const body = (await req.json()) as {
    input?: Omit<CreateAdSetInput, 'adAccountId'>
  }

  if (!body.input?.name || !body.input?.campaignId) {
    return apiError('Missing required fields: name, campaignId', 400)
  }

  // Validate parent campaign exists and belongs to the same org
  const campaign = await getCampaign(body.input.campaignId)
  if (!campaign || campaign.orgId !== ctx.orgId) {
    return apiError('Campaign not found', 404)
  }

  const adSet = await createAdSet({
    orgId: ctx.orgId,
    input: body.input as CreateAdSetInput,
  })

  return apiSuccess(adSet, 201)
})
