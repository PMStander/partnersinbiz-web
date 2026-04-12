/**
 * POST /api/v1/social/ai/generate �� Generate social post captions from a prompt
 */
import { generateText } from 'ai'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { BRIEF_MODEL } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', withTenant(async (req, _user, _orgId) => {
  const body = await req.json()

  const prompt = body.prompt as string
  if (!prompt?.trim()) return apiError('prompt is required')

  const platform = (body.platform as string) ?? 'twitter'
  const tone = (body.tone as string) ?? 'professional'
  const count = Math.min(body.count ?? 3, 5)
  const includeHashtags = body.includeHashtags ?? true
  const includeEmojis = body.includeEmojis ?? false

  const charLimits: Record<string, number> = {
    twitter: 280, linkedin: 3000, facebook: 63206, instagram: 2200,
    reddit: 40000, tiktok: 2200, pinterest: 500, bluesky: 300, threads: 500,
  }
  const maxLen = charLimits[platform] ?? 280

  const { text } = await generateText({
    model: BRIEF_MODEL,
    system: `You are a social media copywriter. Generate ${count} post caption options for the "${platform}" platform.
Rules:
- Each caption must be under ${maxLen} characters
- Tone: ${tone}
- ${includeHashtags ? 'Include 2-5 relevant hashtags at the end' : 'Do not include hashtags'}
- ${includeEmojis ? 'Use emojis naturally' : 'Do not use emojis'}
- Respond as a JSON array of objects: [{"text": "...", "hashtags": ["#tag1", "#tag2"]}]
- Only output the JSON array, no other text`,
    prompt: `Topic/prompt: ${prompt}`,
    maxOutputTokens: 1500,
  })

  try {
    const captions = JSON.parse(text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''))
    return apiSuccess({ captions })
  } catch {
    // Fallback: return raw text as single caption
    return apiSuccess({ captions: [{ text: text.trim(), hashtags: [] }] })
  }
}))
