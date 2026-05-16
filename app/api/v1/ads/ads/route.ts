// app/api/v1/ads/ads/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listAds, createAd } from '@/lib/ads/ads/store'
import { getAdSet } from '@/lib/ads/adsets/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import type { CreateAdInput, AdEntityStatus } from '@/lib/ads/types'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const url = new URL(req.url)
  const status = url.searchParams.get('status') as AdEntityStatus | null
  const adSetId = url.searchParams.get('adSetId')
  const campaignId = url.searchParams.get('campaignId')

  const ads = await listAds({
    orgId,
    status: status ?? undefined,
    adSetId: adSetId ?? undefined,
    campaignId: campaignId ?? undefined,
  })

  return apiSuccess(ads)
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const ctx = await requireMetaContext(req)
  if (ctx instanceof Response) return ctx

  const body = (await req.json()) as {
    input?: Omit<CreateAdInput, 'adAccountId'>
  }

  if (!body.input?.name || !body.input?.adSetId) {
    return apiError('Missing required fields: name, adSetId', 400)
  }

  // Validate parent ad set exists and belongs to the same org
  const adSet = await getAdSet(body.input.adSetId)
  if (!adSet || adSet.orgId !== ctx.orgId) {
    return apiError('Ad set not found', 404)
  }

  const ad = await createAd({
    orgId: ctx.orgId,
    input: body.input as CreateAdInput,
  })

  return apiSuccess(ad, 201)
})
