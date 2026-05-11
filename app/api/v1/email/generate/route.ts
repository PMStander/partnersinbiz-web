/**
 * POST /api/v1/email/generate
 *
 * Multi-kind AI email generator endpoint. Body shape (discriminated):
 *
 *   { kind: 'email',      input: GenerateEmailInput }
 *   { kind: 'subjects',   input: { topic, voice?, count?, body? } }
 *   { kind: 'sequence',   input: GenerateSequenceInput }
 *   { kind: 'newsletter', input: GenerateNewsletterInput }
 *   { kind: 'winback',    input: GenerateWinbackInput }
 *   { kind: 'rewrite',    input: RewriteInput }
 *
 * If `orgId` is supplied at the top level and `input.voice` is missing, we
 * default it from the org's stored brand voice.
 *
 * Auth: client. Idempotency: yes.
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  generateEmail,
  generateNewsletter,
  generateSequence,
  generateSubjectLines,
  generateWinback,
  rewriteEmail,
  type BrandVoice,
  type GenerateEmailInput,
  type GenerateNewsletterInput,
  type GenerateSequenceInput,
  type GenerateWinbackInput,
  type RewriteInput,
} from '@/lib/ai/email-generators'
import { PIB_FOUNDER_VOICE, voiceFromOrg } from '@/lib/ai/voice-presets'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type GenerateKind = 'email' | 'subjects' | 'sequence' | 'newsletter' | 'winback' | 'rewrite'

async function resolveVoice(
  user: ApiUser,
  body: Record<string, unknown>,
  inputVoice: unknown,
): Promise<BrandVoice> {
  if (inputVoice && typeof inputVoice === 'object') {
    return inputVoice as BrandVoice
  }
  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId : null
  if (requestedOrgId) {
    const scope = resolveOrgScope(user, requestedOrgId)
    if (scope.ok) return voiceFromOrg(scope.orgId)
  }
  if (user.orgId) return voiceFromOrg(user.orgId)
  return PIB_FOUNDER_VOICE
}

export const POST = withAuth(
  'client',
  withIdempotency(async (req: NextRequest, user: ApiUser) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('Body required', 400)
    const b = body as Record<string, unknown>

    const kind = b.kind as GenerateKind | undefined
    if (!kind) return apiError('kind is required', 400)
    const rawInput = (b.input ?? {}) as Record<string, unknown>

    try {
      switch (kind) {
        case 'email': {
          const voice = await resolveVoice(user, b, rawInput.voice)
          const input: GenerateEmailInput = {
            goal: String(rawInput.goal ?? '').trim(),
            voice,
            audienceDescription:
              typeof rawInput.audienceDescription === 'string'
                ? rawInput.audienceDescription
                : undefined,
            context: typeof rawInput.context === 'string' ? rawInput.context : undefined,
            contentLength:
              rawInput.contentLength === 'short' ||
              rawInput.contentLength === 'long' ||
              rawInput.contentLength === 'medium'
                ? rawInput.contentLength
                : 'medium',
            cta:
              rawInput.cta && typeof rawInput.cta === 'object'
                ? {
                    text: String((rawInput.cta as Record<string, unknown>).text ?? ''),
                    url: String((rawInput.cta as Record<string, unknown>).url ?? ''),
                  }
                : undefined,
            outputMode: rawInput.outputMode === 'inline' ? 'inline' : 'document',
          }
          if (!input.goal) return apiError('input.goal is required', 400)
          const result = await generateEmail(input)
          return apiSuccess(result)
        }

        case 'subjects': {
          const voice = await resolveVoice(user, b, rawInput.voice)
          const topic = String(rawInput.topic ?? '').trim()
          if (!topic) return apiError('input.topic is required', 400)
          const result = await generateSubjectLines({
            topic,
            voice,
            count: typeof rawInput.count === 'number' ? rawInput.count : undefined,
            body: typeof rawInput.body === 'string' ? rawInput.body : undefined,
          })
          return apiSuccess(result)
        }

        case 'sequence': {
          const voice = await resolveVoice(user, b, rawInput.voice)
          const cadence =
            rawInput.cadence === 'aggressive' || rawInput.cadence === 'patient'
              ? rawInput.cadence
              : 'normal'
          const stepsNum = typeof rawInput.steps === 'number' ? rawInput.steps : 4
          const input: GenerateSequenceInput = {
            name: String(rawInput.name ?? 'Sequence').trim() || 'Sequence',
            goal: String(rawInput.goal ?? '').trim(),
            voice,
            steps: Math.max(2, Math.min(10, stepsNum)),
            cadence,
            audienceDescription:
              typeof rawInput.audienceDescription === 'string'
                ? rawInput.audienceDescription
                : undefined,
            context: typeof rawInput.context === 'string' ? rawInput.context : undefined,
          }
          if (!input.goal) return apiError('input.goal is required', 400)
          const result = await generateSequence(input)
          return apiSuccess(result)
        }

        case 'newsletter': {
          const voice = await resolveVoice(user, b, rawInput.voice)
          const stories = Array.isArray(rawInput.stories)
            ? (rawInput.stories as unknown[])
                .map((s) => {
                  if (!s || typeof s !== 'object') return null
                  const o = s as Record<string, unknown>
                  return {
                    heading: String(o.heading ?? '').trim(),
                    bodyHint: String(o.bodyHint ?? '').trim(),
                    ctaText: typeof o.ctaText === 'string' ? o.ctaText : undefined,
                    ctaUrl: typeof o.ctaUrl === 'string' ? o.ctaUrl : undefined,
                    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : undefined,
                  }
                })
                .filter((s): s is NonNullable<typeof s> => s !== null && s.heading.length > 0)
            : []
          if (stories.length === 0) return apiError('input.stories must have at least one story', 400)
          const input: GenerateNewsletterInput = {
            topic: String(rawInput.topic ?? '').trim() || 'Newsletter',
            voice,
            stories,
            orgName: String(rawInput.orgName ?? '').trim() || 'Your Brand',
            unsubscribeUrl:
              typeof rawInput.unsubscribeUrl === 'string' ? rawInput.unsubscribeUrl : undefined,
          }
          const result = await generateNewsletter(input)
          return apiSuccess(result)
        }

        case 'winback': {
          const voice = await resolveVoice(user, b, rawInput.voice)
          const input: GenerateWinbackInput = {
            contactName: String(rawInput.contactName ?? '').trim() || 'there',
            contactCompany:
              typeof rawInput.contactCompany === 'string' ? rawInput.contactCompany : undefined,
            daysSinceLastInteraction:
              typeof rawInput.daysSinceLastInteraction === 'number'
                ? rawInput.daysSinceLastInteraction
                : 30,
            lastTopicOrProduct:
              typeof rawInput.lastTopicOrProduct === 'string'
                ? rawInput.lastTopicOrProduct
                : undefined,
            voice,
            offer:
              rawInput.offer && typeof rawInput.offer === 'object'
                ? {
                    description: String((rawInput.offer as Record<string, unknown>).description ?? ''),
                    ctaText: String((rawInput.offer as Record<string, unknown>).ctaText ?? ''),
                    ctaUrl: String((rawInput.offer as Record<string, unknown>).ctaUrl ?? ''),
                  }
                : undefined,
          }
          const result = await generateWinback(input)
          return apiSuccess(result)
        }

        case 'rewrite': {
          const voice = await resolveVoice(user, b, rawInput.voice)
          const input: RewriteInput = {
            body: String(rawInput.body ?? ''),
            voice,
            instruction:
              rawInput.instruction === 'tighten' ||
              rawInput.instruction === 'expand' ||
              rawInput.instruction === 'soften' ||
              rawInput.instruction === 'sharpen' ||
              rawInput.instruction === 'translate-sa-english'
                ? rawInput.instruction
                : undefined,
          }
          if (!input.body) return apiError('input.body is required', 400)
          const result = await rewriteEmail(input)
          return apiSuccess(result)
        }

        default:
          return apiError(`Unknown kind "${kind}"`, 400)
      }
    } catch (err) {
      const message = (err as Error)?.message ?? 'Generation failed'
      return apiError(message, 500)
    }
  }),
)
