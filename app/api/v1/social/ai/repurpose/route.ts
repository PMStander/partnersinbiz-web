/**
 * POST /api/v1/social/ai/repurpose — Repurpose content for different platforms
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

  const sourcePlatform = (body.sourcePlatform as string) ?? 'twitter'
  const targetPlatforms = (body.targetPlatforms as string[]) ?? ['linkedin', 'threads']

  const charLimits: Record<string, number> = {
    twitter: 280, linkedin: 3000, facebook: 63206, instagram: 2200,
    reddit: 40000, tiktok: 2200, pinterest: 500, bluesky: 300, threads: 500,
  }

  const platformInstructions = targetPlatforms.map(p => {
    const limit = charLimits[p] ?? 280
    return `- "${p}": max ${limit} chars, adapt tone and format for this platform`
  }).join('\n')

  const { text: result } = await generateText({
    model: BRIEF_MODEL,
    system: `You are a social media content repurposing expert. Take content written for "${sourcePlatform}" and adapt it for other platforms.
Rules:
- Maintain the core message but adapt tone, length, and format
- Each adaptation should feel native to its target platform
${platformInstructions}
- Respond as a JSON object: {"versions": [{"platform": "...", "text": "...", "hashtags": ["#tag"]}]}
- Only output the JSON, no other text`,
    prompt: `Original "${sourcePlatform}" content:\n${text}`,
    maxOutputTokens: 2000,
  })

  try {
    const parsed = JSON.parse(result.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''))
    return apiSuccess(parsed)
  } catch {
    return apiSuccess({ versions: [] })
  }
}))
