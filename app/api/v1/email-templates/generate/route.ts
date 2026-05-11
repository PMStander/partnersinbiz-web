/**
 * POST /api/v1/email-templates/generate
 *
 * Generate an EmailDocument and save it as a new email_templates document.
 *
 * Body — one of:
 *   { kind: 'newsletter', input: GenerateNewsletterInput }
 *   { kind: 'email',      input: GenerateEmailInput }      // forced to document mode
 *
 * Optional top-level: { orgId, name, description }. orgId is required for
 * admin/ai roles. The resulting template is created in category
 * 'newsletter' for newsletters, 'custom' otherwise.
 *
 * Auth: client.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import {
  generateEmail,
  generateNewsletter,
  type BrandVoice,
  type GenerateEmailInput,
  type GenerateNewsletterInput,
} from '@/lib/ai/email-generators'
import { PIB_FOUNDER_VOICE, voiceFromOrg } from '@/lib/ai/voice-presets'
import { validateDocument } from '@/lib/email-builder/validate'
import type { EmailDocument } from '@/lib/email-builder/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = withAuth(
  'client',
  withIdempotency(async (req: NextRequest, user: ApiUser) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('Body required', 400)
    const b = body as Record<string, unknown>

    const requestedOrgId = typeof b.orgId === 'string' ? b.orgId : null
    const scope = resolveOrgScope(user, requestedOrgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const orgId = scope.orgId

    const kind = b.kind === 'newsletter' ? 'newsletter' : 'email'
    const rawInput = (b.input ?? {}) as Record<string, unknown>

    const voiceInput = rawInput.voice
    const voice: BrandVoice =
      voiceInput && typeof voiceInput === 'object'
        ? (voiceInput as BrandVoice)
        : await voiceFromOrg(orgId).catch(() => PIB_FOUNDER_VOICE)

    let document: EmailDocument | null = null
    let subject = ''
    let preheader = ''

    try {
      if (kind === 'newsletter') {
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
        if (stories.length === 0)
          return apiError('input.stories must have at least one story', 400)
        const input: GenerateNewsletterInput = {
          topic: String(rawInput.topic ?? '').trim() || 'Newsletter',
          voice,
          stories,
          orgName: String(rawInput.orgName ?? '').trim() || 'Your Brand',
          unsubscribeUrl:
            typeof rawInput.unsubscribeUrl === 'string' ? rawInput.unsubscribeUrl : undefined,
        }
        const result = await generateNewsletter(input)
        document = result.document
        subject = result.subject
        preheader = result.preheader
      } else {
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
          outputMode: 'document',
        }
        if (!input.goal) return apiError('input.goal is required', 400)
        const result = await generateEmail(input)
        document = result.document ?? null
        subject = result.subject
        preheader = result.preheader
      }
    } catch (err) {
      return apiError((err as Error)?.message ?? 'Generation failed', 500)
    }

    if (!document) return apiError('Failed to produce a valid EmailDocument', 500)

    const v = validateDocument(document)
    if (!v.ok) return apiError('Generated document failed validation: ' + v.errors.join('; '), 500)

    const category = kind === 'newsletter' ? 'newsletter' : 'custom'
    const name = (typeof b.name === 'string' && b.name.trim()) || subject || 'AI-generated email'
    const description = typeof b.description === 'string' ? b.description : `AI-generated ${kind}`

    const docData = {
      orgId,
      name: name.trim().slice(0, 200),
      description,
      category,
      document: v.doc,
      isStarter: false,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...actorFrom(user),
    }

    const ref = await adminDb.collection('email_templates').add(docData)
    return apiSuccess(
      {
        id: ref.id,
        name: docData.name,
        document: v.doc,
        category,
        subject,
        preheader,
      },
      201,
    )
  }),
)
