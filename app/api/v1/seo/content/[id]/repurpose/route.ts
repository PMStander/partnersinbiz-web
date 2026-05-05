import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth(
  'admin',
  withIdempotency(async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const platforms: string[] = body.platforms ?? ['linkedin', 'twitter']
    const ref = adminDb.collection('seo_content').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Content not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)

    // Cross-skill handoff: call existing social posts endpoint to draft posts
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const apiKey = process.env.AI_API_KEY ?? ''
    const drafted: Record<string, string> = {}
    for (const platform of platforms) {
      try {
        const res = await fetch(`${base}/api/v1/social/posts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            platform,
            content: `New: ${data.title}\n\n${data.targetUrl ?? ''}`.trim(),
            status: 'draft',
            orgId: data.orgId,
          }),
        })
        const json = await res.json()
        if (json?.data?.id) drafted[platform] = json.data.id
      } catch {
        // continue
      }
    }
    const update: Record<string, unknown> = { ...lastActorFrom(user) }
    if (drafted.linkedin) update.liUrl = drafted.linkedin
    if (drafted.twitter) update.xUrl = drafted.twitter
    await ref.update(update)
    return apiSuccess({ id, drafted })
  }),
)
