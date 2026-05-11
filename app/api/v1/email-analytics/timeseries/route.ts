/**
 * GET /api/v1/email-analytics/timeseries?orgId=...&from=...&to=...&bucket=day|week
 * Auth: client. Returns EngagementTimeseries.
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getEngagementTimeseries } from '@/lib/email-analytics/aggregate'
import { parseDateRange } from '@/lib/email-analytics/range'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)

  const range = parseDateRange(searchParams)
  if (!range) return apiError('Invalid from/to dates', 400)

  const bucketParam = searchParams.get('bucket') ?? 'day'
  const bucket: 'day' | 'week' = bucketParam === 'week' ? 'week' : 'day'

  const series = await getEngagementTimeseries(scope.orgId, range, bucket)
  return apiSuccess(series)
})
