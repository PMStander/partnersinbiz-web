/**
 * POST /api/v1/broadcasts/[id]/generate
 *
 * Generate an email for an existing broadcast and write the subject + body
 * onto its `content` field. Refuses if `content.templateId` is set (you must
 * clear the template before replacing content inline).
 *
 * Body: GenerateEmailInput (without voice — defaults to org voice).
 * Auth: client.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { generateEmail, type BrandVoice, type GenerateEmailInput } from '@/lib/ai/email-generators'
import { PIB_FOUNDER_VOICE, voiceFromOrg } from '@/lib/ai/voice-presets'
import type { ApiUser } from '@/lib/api/types'
import type { Broadcast } from '@/lib/broadcasts/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth(
  'client',
  withIdempotency(async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id } = await (context as Params).params
    const snap = await adminDb.collection('broadcasts').doc(id).get()
    if (!snap.exists || snap.data()?.deleted) return apiError('Broadcast not found', 404)
    const current = snap.data() as Broadcast
    const scope = resolveOrgScope(user, current.orgId ?? null)
    if (!scope.ok) return apiError(scope.error, scope.status)

    if (current.content?.templateId) {
      return apiError(
        'Clear the template before generating inline content (content.templateId is set).',
        422,
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('Body required', 400)
    const b = body as Record<string, unknown>

    const voiceInput = b.voice
    const voice: BrandVoice =
      voiceInput && typeof voiceInput === 'object'
        ? (voiceInput as BrandVoice)
        : await voiceFromOrg(scope.orgId).catch(() => PIB_FOUNDER_VOICE)

    const input: GenerateEmailInput = {
      goal: String(b.goal ?? '').trim(),
      voice,
      audienceDescription:
        typeof b.audienceDescription === 'string' ? b.audienceDescription : undefined,
      context: typeof b.context === 'string' ? b.context : undefined,
      contentLength:
        b.contentLength === 'short' || b.contentLength === 'long' || b.contentLength === 'medium'
          ? b.contentLength
          : 'medium',
      cta:
        b.cta && typeof b.cta === 'object'
          ? {
              text: String((b.cta as Record<string, unknown>).text ?? ''),
              url: String((b.cta as Record<string, unknown>).url ?? ''),
            }
          : undefined,
      outputMode: b.outputMode === 'document' ? 'document' : 'inline',
    }
    if (!input.goal) return apiError('goal is required', 400)

    const result = await generateEmail(input)

    const content = {
      templateId: '',
      subject: result.subject,
      preheader: result.preheader,
      bodyHtml: result.bodyHtml,
      bodyText: result.bodyText,
    }

    await adminDb
      .collection('broadcasts')
      .doc(id)
      .update({
        content,
        ...lastActorFrom(user),
        updatedAt: FieldValue.serverTimestamp(),
      })

    return apiSuccess({ id, content, modelUsed: result.modelUsed, generatedAt: result.generatedAt })
  }),
)
