/**
 * GET /api/cron/social-analytics — Cron endpoint for collecting analytics snapshots.
 *
 * Called every 6 hours by Vercel Cron or external scheduler.
 * Auth: CRON_SECRET or AI_API_KEY bearer tokens.
 */
import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api/response'
import { processAnalyticsCron } from '@/lib/social/analytics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validCronAuth = auth === `Bearer ${process.env.CRON_SECRET}`
  const validApiAuth = auth === `Bearer ${process.env.AI_API_KEY}`
  if (!validCronAuth && !validApiAuth) return apiError('Unauthorized', 401)

  const result = await processAnalyticsCron()

  return apiSuccess(result)
}
