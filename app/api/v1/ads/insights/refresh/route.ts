// app/api/v1/ads/insights/refresh/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { enqueueRefresh } from '@/lib/ads/insights/queue'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { getAdSet } from '@/lib/ads/adsets/store'
import { getAd } from '@/lib/ads/ads/store'
import type { InsightLevel } from '@/lib/ads/providers/meta/insights'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const body = (await req.json()) as { level?: InsightLevel; pibEntityId?: string }
  if (!body.level || !body.pibEntityId) return apiError('Missing level or pibEntityId', 400)

  const entity =
    body.level === 'campaign'
      ? await getCampaign(body.pibEntityId)
      : body.level === 'adset'
        ? await getAdSet(body.pibEntityId)
        : await getAd(body.pibEntityId)

  if (!entity || entity.orgId !== orgId) return apiError('Entity not found', 404)

  const metaObjectId = (entity.providerData?.meta as { id?: string } | undefined)?.id
  if (!metaObjectId) return apiError('Entity not yet pushed to Meta', 400)

  const result = await enqueueRefresh({
    orgId,
    pibEntityId: body.pibEntityId,
    metaObjectId,
    level: body.level,
  })

  return apiSuccess(result)
})
