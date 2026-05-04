import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateMetaCandidates } from '@/lib/seo/tools/ai-generators'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.topic || !body?.keyword) return apiError('topic and keyword are required', 400)
  return apiSuccess({ candidates: generateMetaCandidates(body.topic, body.keyword) })
})
