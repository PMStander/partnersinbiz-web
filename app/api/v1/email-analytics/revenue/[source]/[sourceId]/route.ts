/**
 * GET /api/v1/email-analytics/revenue/[source]/[sourceId]?orgId=...
 * source: broadcast | campaign | sequence
 * Auth: client. Returns BroadcastRevenueRollup.
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError, apiErrorFromException } from '@/lib/api/response'
import { getAttributedRevenue } from '@/lib/email-analytics/attribution'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ source: string; sourceId: string }> }

const VALID_SOURCES = ['broadcast', 'campaign', 'sequence'] as const
type ValidSource = (typeof VALID_SOURCES)[number]

function isValidSource(s: string): s is ValidSource {
  return (VALID_SOURCES as readonly string[]).includes(s)
}

export const GET = withAuth(
  'client',
  async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { source, sourceId } = await (context as Params).params
    if (!isValidSource(source)) {
      return apiError(
        `Invalid source — must be one of: ${VALID_SOURCES.join(', ')}`,
        400,
      )
    }
    if (!sourceId || !sourceId.trim()) {
      return apiError('sourceId is required', 400)
    }

    const { searchParams } = new URL(req.url)
    const scope = resolveOrgScope(user, searchParams.get('orgId'))
    if (!scope.ok) return apiError(scope.error, scope.status)

    try {
      const rollup = await getAttributedRevenue(scope.orgId, source, sourceId)
      return apiSuccess(rollup)
    } catch (err) {
      return apiErrorFromException(err)
    }
  },
)
