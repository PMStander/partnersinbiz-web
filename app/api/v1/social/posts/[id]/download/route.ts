/**
 * GET /api/v1/social/posts/:id/download
 *
 * Download a post as a JSON bundle the client can save locally. Used for
 * delivery-mode "download_only" / "both" — the org gets a portable artefact
 * with text, hashtags, platforms, and media URLs.
 *
 * Returns NextResponse.json directly with attachment headers so the browser
 * triggers a download instead of rendering JSON.
 */
import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiError } from '@/lib/api/response'
import { logAudit } from '@/lib/social/audit'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

interface MediaIn {
  url?: string
  type?: string
  altText?: string
}

export const GET = withAuth('client', withTenant(async (_req, user, orgId, context) => {
  const { id } = await (context as Params).params

  const snap = await adminDb.collection('social_posts').doc(id).get()
  if (!snap.exists) return apiError('Post not found', 404)

  const post = snap.data()!
  if (post.orgId && post.orgId !== orgId) return apiError('Post not found', 404)

  const text =
    typeof post.content === 'string' ? post.content : (post.content?.text as string | undefined) ?? ''

  const mediaIn: MediaIn[] = Array.isArray(post.media) ? (post.media as MediaIn[]) : []
  const media = mediaIn.map((m) => ({
    url: m.url ?? '',
    type: m.type ?? 'image',
    altText: m.altText ?? '',
  }))

  const body = {
    postId: id,
    orgId,
    content: { text },
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    platforms: Array.isArray(post.platforms) ? post.platforms : [],
    media,
    approvedAt: post.approvedAt ?? null,
    downloadFormat: 'json' as const,
    generatedAt: new Date().toISOString(),
  }

  await logAudit({
    orgId,
    action: 'post.downloaded',
    entityType: 'post',
    entityId: id,
    performedBy: user.uid,
    performedByRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    details: { format: 'json', userId: user.uid },
  })

  return NextResponse.json(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="post-${id}.json"`,
    },
  })
}))
