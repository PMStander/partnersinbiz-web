import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runMetadataCheck } from '@/lib/seo/tools/metadata'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.url) return apiError('url is required', 400)
  const result = await runMetadataCheck(body.url)
  return apiSuccess(result)
})
