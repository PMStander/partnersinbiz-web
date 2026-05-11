/**
 * GET /api/v1/email-analytics/contacts?orgId=...&status=...&limit=...
 * Auth: client. Returns ContactEngagement[].
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  getContactEngagement,
  type ContactEngagement,
} from '@/lib/email-analytics/aggregate'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: ContactEngagement['status'][] = [
  'highly-engaged',
  'engaged',
  'cooling',
  'dormant',
  'unsubscribed',
  'bounced',
]

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)

  const statusParam = searchParams.get('status')
  const status: ContactEngagement['status'] | undefined =
    statusParam && (VALID_STATUSES as string[]).includes(statusParam)
      ? (statusParam as ContactEngagement['status'])
      : undefined

  const limitParam = searchParams.get('limit')
  const limit = limitParam
    ? Math.max(1, Math.min(500, parseInt(limitParam, 10) || 100))
    : 100

  const rows = await getContactEngagement(scope.orgId, { status, limit })
  return apiSuccess(rows)
})
