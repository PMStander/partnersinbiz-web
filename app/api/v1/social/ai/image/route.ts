/**
 * POST /api/v1/social/ai/image — Generate images using xAI (Grok) or Gemini
 *
 * Provider priority: xAI (if XAI_API_KEY set) → Gemini (if GEMINI_API_KEY set)
 * Both support high-quality image generation from text prompts.
 */
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

interface ImageGenerationRequest {
  prompt: string
  size?: '1024x1024' | '1024x1536' | '1536x1024'
  provider?: 'xai' | 'gemini' // auto-select if omitted
}

// ---------------------------------------------------------------------------
// xAI (Grok) image generation
// ---------------------------------------------------------------------------
async function generateWithXai(prompt: string, apiKey: string): Promise<{ url: string; revisedPrompt: string }> {
  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-2-image',
      prompt,
      n: 1,
      response_format: 'url',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } }
    const msg = errorData?.error?.message ?? `xAI API error (${response.status})`
    if (response.status === 429) throw new Error('RATE_LIMIT')
    if (response.status === 400 && msg.toLowerCase().includes('policy')) throw new Error('CONTENT_POLICY')
    throw new Error(msg)
  }

  const data = await response.json() as {
    data: Array<{ url: string; revised_prompt?: string }>
  }

  if (!data.data?.[0]?.url) throw new Error('No image returned from xAI')

  return {
    url: data.data[0].url,
    revisedPrompt: data.data[0].revised_prompt ?? prompt,
  }
}

// ---------------------------------------------------------------------------
// Google Gemini image generation (Imagen 3 via Gemini API)
// ---------------------------------------------------------------------------
async function generateWithGemini(
  prompt: string,
  apiKey: string,
  size: string,
): Promise<{ url: string; revisedPrompt: string }> {
  // Gemini's Imagen 3 endpoint
  const aspectRatio = size === '1024x1536' ? '2:3'
    : size === '1536x1024' ? '3:2'
    : '1:1'

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio,
          personGeneration: 'allow_adult',
        },
      }),
    },
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: { message?: string; status?: string } }
    const msg = errorData?.error?.message ?? `Gemini API error (${response.status})`
    if (response.status === 429) throw new Error('RATE_LIMIT')
    if (msg.toLowerCase().includes('safety') || msg.toLowerCase().includes('policy')) throw new Error('CONTENT_POLICY')
    throw new Error(msg)
  }

  const data = await response.json() as {
    predictions?: Array<{ bytesBase64Encoded: string; mimeType: string }>
  }

  if (!data.predictions?.[0]?.bytesBase64Encoded) {
    throw new Error('No image returned from Gemini')
  }

  // Return as a data URI — the compose page can handle this
  const mimeType = data.predictions[0].mimeType ?? 'image/png'
  const dataUri = `data:${mimeType};base64,${data.predictions[0].bytesBase64Encoded}`

  return {
    url: dataUri,
    revisedPrompt: prompt,
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export const POST = withAuth('admin', withTenant(async (req, _user, _orgId) => {
  const body = await req.json() as ImageGenerationRequest

  const prompt = body.prompt?.trim()
  if (!prompt) return apiError('prompt is required', 400)
  if (prompt.length > 4000) return apiError('prompt must be 4000 characters or less', 400)

  const size = body.size ?? '1024x1024'
  if (!['1024x1024', '1024x1536', '1536x1024'].includes(size)) {
    return apiError('size must be "1024x1024", "1024x1536", or "1536x1024"', 400)
  }

  // Determine provider: explicit choice → env-based fallback
  const xaiKey = process.env.XAI_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY

  let provider = body.provider
  if (!provider) {
    provider = xaiKey ? 'xai' : geminiKey ? 'gemini' : undefined
  }

  if (!provider) {
    return apiError('No image generation API key configured. Set XAI_API_KEY or GEMINI_API_KEY.', 500)
  }

  if (provider === 'xai' && !xaiKey) return apiError('XAI_API_KEY not configured', 500)
  if (provider === 'gemini' && !geminiKey) return apiError('GEMINI_API_KEY not configured', 500)

  try {
    let result: { url: string; revisedPrompt: string }

    if (provider === 'xai') {
      result = await generateWithXai(prompt, xaiKey!)
    } else {
      result = await generateWithGemini(prompt, geminiKey!, size)
    }

    return apiSuccess({
      url: result.url,
      revisedPrompt: result.revisedPrompt,
      provider,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    if (message === 'RATE_LIMIT') {
      return apiError('Rate limit exceeded. Please try again later.', 429)
    }
    if (message === 'CONTENT_POLICY') {
      return apiError('Image prompt violates content policy. Please try a different prompt.', 400)
    }

    console.error('Image generation error:', error)
    return apiError(`Image generation failed: ${message}`, 500)
  }
}))
