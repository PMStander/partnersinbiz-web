/**
 * POST /api/v1/social/inbox/poll — Manually trigger an inbox poll for the current org.
 *
 * Auth: withAuth('admin', withTenant(...))
 * Calls runInboxPoll(orgId) for the current org only.
 * Returns { polled, newItems, errors? }
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runInboxPoll } from '@/lib/social/run-inbox-poll'

export const dynamic = 'force-dynamic'

const handler = async (req: NextRequest, _user: any, orgId: string) => {
  try {
    const result = await runInboxPoll(orgId)
    return apiSuccess(result)
  } catch (error) {
    console.error('[inbox-poll-api] Error:', error)
    return apiError(`Polling failed: ${String(error)}`, 500)
  }
}

export const POST = withAuth('admin', withTenant(handler))
