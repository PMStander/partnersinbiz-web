import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runSitemapCheck } from '@/lib/seo/tools/sitemap'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.sitemapUrl) return apiError('sitemapUrl is required', 400)
  const result = await runSitemapCheck(body.sitemapUrl)
  return apiSuccess(result)
})
