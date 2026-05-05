import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth(
  'admin',
  withIdempotency(async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const ref = adminDb.collection('seo_content').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Content not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)

    // Persist a draft artifact (existing seo_drafts collection)
    const draftRef = await adminDb.collection('seo_drafts').add({
      contentId: id,
      sprintId: data.sprintId,
      orgId: data.orgId,
      title: data.title,
      type: data.type,
      // For v1, the actual AI generation is delegated to /api/v1/seo/tools/title-generate
      // and meta-generate. We just create the draft shell here.
      generatedAt: FieldValue.serverTimestamp(),
      body: `<draft for "${data.title}" — call /api/v1/seo/tools/title-generate and /meta-generate for AI text>`,
      status: 'draft',
      createdAt: FieldValue.serverTimestamp(),
    })

    await ref.update({
      status: 'review',
      draftPostId: draftRef.id,
      ...lastActorFrom(user),
    })
    return apiSuccess({ id, draftPostId: draftRef.id })
  }),
)
