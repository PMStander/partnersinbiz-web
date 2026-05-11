/**
 * GET /api/v1/email-analytics/leaderboard?from=...&to=...
 * Auth: admin only (platform admin / ai).
 * Returns OrgComparisonRow[].
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getPlatformLeaderboard } from '@/lib/email-analytics/aggregate'
import { parseDateRange } from '@/lib/email-analytics/range'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const range = parseDateRange(searchParams)
  if (!range) return apiError('Invalid from/to dates', 400)
  const rows = await getPlatformLeaderboard(range)
  return apiSuccess(rows)
})
