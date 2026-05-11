/**
 * GET /api/v1/email-analytics/cohort?orgId=...&from=...&to=...&weeksToShow=...
 * Auth: client. Returns CohortAnalysis.
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError, apiErrorFromException } from '@/lib/api/response'
import { getCohortAnalysis } from '@/lib/email-analytics/aggregate'
import { parseDateRange } from '@/lib/email-analytics/range'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)

  const range = parseDateRange(searchParams)
  if (!range) return apiError('Invalid from/to dates', 400)

  const weeksParam = searchParams.get('weeksToShow')
  let weeksToShow: number | undefined
  if (weeksParam) {
    const parsed = parseInt(weeksParam, 10)
    if (!Number.isNaN(parsed)) weeksToShow = Math.max(1, Math.min(52, parsed))
  }

  try {
    const cohort = await getCohortAnalysis(scope.orgId, range, weeksToShow)
    return apiSuccess(cohort)
  } catch (err) {
    return apiErrorFromException(err)
  }
})
