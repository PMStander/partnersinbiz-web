import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateSlug } from '@/lib/seo/tools/ai-generators'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.title) return apiError('title is required', 400)
  return apiSuccess({ slug: generateSlug(body.title) })
})
