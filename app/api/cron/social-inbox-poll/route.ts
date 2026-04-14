/**
 * GET /api/cron/social-inbox-poll — Poll all social accounts for new inbox items.
 *
 * Secured by Authorization: Bearer ${CRON_SECRET}
 * Vercel cron schedule: every 2 hours (see vercel.json)
 *
 * For each active social_account:
 *   1. Decrypt the access token
 *   2. Call the appropriate platform poller
 *   3. Deduplicate by platformItemId
 *   4. Insert new items to social_inbox collection with status='unread'
 */
import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runInboxPoll } from '@/lib/social/run-inbox-poll'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validCronAuth = auth === `Bearer ${process.env.CRON_SECRET}`
  const validApiAuth = auth === `Bearer ${process.env.AI_API_KEY}`
  if (!validCronAuth && !validApiAuth) return apiError('Unauthorized', 401)

  const result = await runInboxPoll()

  return apiSuccess(result)
}
