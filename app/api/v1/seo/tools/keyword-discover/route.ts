import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { discoverKeywords } from '@/lib/seo/tools/keyword-discover'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.seedKeywords) return apiError('seedKeywords is required', 400)
  const seeds = Array.isArray(body.seedKeywords)
    ? body.seedKeywords
    : String(body.seedKeywords).split(',').map((s) => s.trim()).filter(Boolean)
  const result = await discoverKeywords(seeds, body.siteUrl)
  return apiSuccess({ candidates: result, count: result.length })
})
