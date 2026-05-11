/**
 * GET /api/v1/email-analytics/benchmarks?orgId=...&industry=...&from=...&to=...
 * Auth: client. Returns BenchmarkComparison.
 *
 * `industry` is optional — defaults to the org's `settings.industry` and
 * falls back to 'newsletter' when unset.
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError, apiErrorFromException } from '@/lib/api/response'
import {
  compareToBenchmarks,
  getOrgIndustry,
  isIndustryType,
  type IndustryType,
} from '@/lib/email-analytics/benchmarks'
import { parseDateRange } from '@/lib/email-analytics/range'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)

  const range = parseDateRange(searchParams)
  if (!range) return apiError('Invalid from/to dates', 400)

  const industryParam = searchParams.get('industry')
  let industry: IndustryType
  if (industryParam && isIndustryType(industryParam)) {
    industry = industryParam
  } else if (industryParam) {
    return apiError(
      'Invalid industry — must be one of: newsletter, ecommerce, saas, agency, nonprofit, b2b, media, finance, health',
      400,
    )
  } else {
    industry = await getOrgIndustry(scope.orgId)
  }

  try {
    const comparison = await compareToBenchmarks(scope.orgId, industry, range)
    return apiSuccess(comparison)
  } catch (err) {
    return apiErrorFromException(err)
  }
})
