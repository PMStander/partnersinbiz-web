import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runRobotsCheck } from '@/lib/seo/tools/robots'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.domain) return apiError('domain is required', 400)
  const result = await runRobotsCheck(body.domain)
  return apiSuccess(result)
})
