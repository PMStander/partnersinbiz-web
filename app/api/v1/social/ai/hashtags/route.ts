/**
 * POST /api/v1/social/ai/hashtags — Suggest relevant hashtags for content
 */
import { generateText } from 'ai'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { BRIEF_MODEL } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', withTenant(async (req, _user, _orgId) => {
  const body = await req.json()

  const text = body.text as string
  if (!text?.trim()) return apiError('text is required')

  const platform = (body.platform as string) ?? 'twitter'
  const count = Math.min(body.count ?? 10, 20)

  const { text: result } = await generateText({
    model: BRIEF_MODEL,
    system: `You are a social media hashtag strategist. Suggest ${count} relevant hashtags for the given content on "${platform}".
Rules:
- Mix popular and niche hashtags for best reach
- Rate each hashtag's relevance from 0.0 to 1.0
- Respond as a JSON array: [{"tag": "#hashtag", "relevance": 0.95}]
- Only output the JSON array, no other text
- All tags must start with #`,
    prompt: `Content: ${text}`,
    maxOutputTokens: 500,
  })

  try {
    const hashtags = JSON.parse(result.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''))
    return apiSuccess({ hashtags })
  } catch {
    return apiSuccess({ hashtags: [] })
  }
}))
