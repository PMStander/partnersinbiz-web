import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { FieldValue } from 'firebase-admin/firestore'
import { slugFromTargetUrl } from '@/lib/content/posts-firestore'
import { logActivity } from '@/lib/activity/log'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 80)
}

export const POST = withAuth(
  'admin',
  withIdempotency(async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const ref = adminDb.collection('seo_content').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Content not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)

    const targetUrl = body.targetUrl ?? data.targetUrl
    // Slug resolution priority: body.slug → existing data.slug → derived from
    // body.targetUrl path → slugified title. Persist so the public reader at
    // /insights/[slug] can find it via index lookup.
    const slug =
      (typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : null) ??
      data.slug ??
      slugFromTargetUrl(targetUrl) ??
      (typeof data.title === 'string' ? slugify(data.title) : null) ??
      id

    await ref.update({
      status: 'live',
      slug,
      targetUrl,
      publishDate: body.publishDate ?? new Date().toISOString(),
      publishedAt: FieldValue.serverTimestamp(),
      ...lastActorFrom(user),
    })
    logActivity({
      orgId: data.orgId,
      type: 'seo_content_published',
      actorId: user.uid,
      actorName: user.uid,
      actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
      description: 'Published SEO content',
      entityId: id,
      entityType: 'seo_content',
    }).catch(() => {})
    return apiSuccess({ id, published: true, slug })
  }),
)
