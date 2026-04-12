/**
 * GET /api/cron/social-rss — Cron endpoint for checking RSS feeds and creating drafts.
 *
 * Called every 15 minutes by Vercel Cron or external scheduler.
 * Auth: CRON_SECRET or AI_API_KEY bearer tokens.
 */
import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api/response'
import { processRssFeeds } from '@/lib/social/rss'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validCronAuth = auth === `Bearer ${process.env.CRON_SECRET}`
  const validApiAuth = auth === `Bearer ${process.env.AI_API_KEY}`
  if (!validCronAuth && !validApiAuth) return apiError('Unauthorized', 401)

  const result = await processRssFeeds()

  return apiSuccess(result)
}
