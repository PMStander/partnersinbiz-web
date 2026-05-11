/**
 * POST /api/v1/sequences/[id]/generate
 *
 * Generate sequence steps with AI and write them onto an existing sequence.
 * Auth: client. Returns { updated: true, steps }.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { generateSequence, type BrandVoice, type GenerateSequenceInput } from '@/lib/ai/email-generators'
import { PIB_FOUNDER_VOICE, voiceFromOrg } from '@/lib/ai/voice-presets'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth(
  'client',
  withIdempotency(async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id } = await (context as Params).params
    const snap = await adminDb.collection('sequences').doc(id).get()
    if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
    const orgId = (snap.data()?.orgId as string | undefined) ?? null
    const scope = resolveOrgScope(user, orgId)
    if (!scope.ok) return apiError(scope.error, scope.status)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('Body required', 400)
    const b = body as Record<string, unknown>

    const voiceInput = b.voice
    const voice: BrandVoice =
      voiceInput && typeof voiceInput === 'object'
        ? (voiceInput as BrandVoice)
        : await voiceFromOrg(scope.orgId).catch(() => PIB_FOUNDER_VOICE)

    const cadence =
      b.cadence === 'aggressive' || b.cadence === 'patient' ? b.cadence : 'normal'
    const stepsNum = typeof b.steps === 'number' ? b.steps : 4

    const input: GenerateSequenceInput = {
      name: (snap.data()?.name as string | undefined) ?? 'Sequence',
      goal: String(b.goal ?? '').trim(),
      voice,
      steps: Math.max(2, Math.min(10, stepsNum)),
      cadence,
      audienceDescription:
        typeof b.audienceDescription === 'string' ? b.audienceDescription : undefined,
      context: typeof b.context === 'string' ? b.context : undefined,
    }
    if (!input.goal) return apiError('goal is required', 400)

    const result = await generateSequence(input)

    await adminDb
      .collection('sequences')
      .doc(id)
      .update({
        steps: result.steps,
        description: result.description,
        ...lastActorFrom(user),
        updatedAt: FieldValue.serverTimestamp(),
      })

    return apiSuccess({ updated: true, steps: result.steps, description: result.description })
  }),
)
