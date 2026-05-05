import { NextRequest } from 'next/server'
import { runDailyLoop } from '@/lib/seo/loops/daily'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)
  const result = await runDailyLoop()
  return apiSuccess(result)
}
