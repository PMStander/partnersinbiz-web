/**
 * GET /api/v1/email-analytics/send-time-matrix?orgId=...&from=...&to=...
 * Auth: client. Returns SendTimeMatrix (7x24 grid of send/open rates).
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError, apiErrorFromException } from '@/lib/api/response'
import { getSendTimeMatrix } from '@/lib/email-analytics/aggregate'
import { parseDateRange } from '@/lib/email-analytics/range'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)

  const range = parseDateRange(searchParams)
  if (!range) return apiError('Invalid from/to dates', 400)

  try {
    const matrix = await getSendTimeMatrix(scope.orgId, range)
    return apiSuccess(matrix)
  } catch (err) {
    return apiErrorFromException(err)
  }
})
