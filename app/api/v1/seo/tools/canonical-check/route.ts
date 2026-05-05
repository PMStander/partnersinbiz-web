import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runCanonicalCheck } from '@/lib/seo/tools/canonical'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.url) return apiError('url is required', 400)
  const result = await runCanonicalCheck(body.url)
  return apiSuccess(result)
})
