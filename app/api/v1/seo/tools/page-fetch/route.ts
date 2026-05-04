import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { fetchPage } from '@/lib/seo/tools/page-fetch'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.url) return apiError('url is required', 400)
  const result = await fetchPage(body.url)
  // Don't return full HTML by default — too large
  return apiSuccess({ url: body.url, status: result.status, bytes: result.html.length, cachedAt: result.cachedAt })
})
