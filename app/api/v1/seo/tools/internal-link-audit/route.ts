import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runInternalLinkAudit } from '@/lib/seo/tools/internal-link-audit'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.sitemapUrl) return apiError('sitemapUrl is required', 400)
  const result = await runInternalLinkAudit(body.sitemapUrl)
  return apiSuccess(result)
})
