// app/api/v1/ads/cron/process-refresh-queue/route.ts
import { NextRequest } from 'next/server'
import { drainRefreshQueue } from '@/lib/ads/insights/worker'
import { apiSuccess, apiError } from '@/lib/api/response'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError('Unauthorized', 401)
  }
  const result = await drainRefreshQueue()
  return apiSuccess(result)
}
