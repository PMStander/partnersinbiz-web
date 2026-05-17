// app/api/v1/ads/conversions/events/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listCapiEvents } from '@/lib/ads/capi-events/store'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const { searchParams } = new URL(req.url)

  const eventName = searchParams.get('eventName') ?? undefined

  const sinceRaw = searchParams.get('since')
  const since = sinceRaw !== null ? Number(sinceRaw) : undefined

  const untilRaw = searchParams.get('until')
  const until = untilRaw !== null ? Number(untilRaw) : undefined

  const limitRaw = searchParams.get('limit')
  const limit = limitRaw !== null ? Number(limitRaw) : 100

  const events = await listCapiEvents({ orgId, eventName, since, until, limit })

  return apiSuccess(events)
})
