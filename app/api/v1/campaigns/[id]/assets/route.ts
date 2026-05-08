/**
 * GET /api/v1/campaigns/[id]/assets
 *
 * Returns the CampaignAssets roll-up: social_posts and seo_content (with
 * draft data joined where present) attached to this campaignId. Videos are
 * split out as the subset of social_posts with media[0].type === 'video'.
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import type { CampaignAssets } from '@/lib/types/campaign'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isVideoPost(p: any): boolean {
  return Array.isArray(p.media) && p.media[0]?.type === 'video'
}

export async function buildCampaignAssets(campaignId: string): Promise<CampaignAssets> {
  const [socialSnap, seoSnap] = await Promise.all([
    adminDb.collection('social_posts').where('campaignId', '==', campaignId).get(),
    adminDb.collection('seo_content').where('campaignId', '==', campaignId).get(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSocial: any[] = socialSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const social = allSocial.filter((p) => !isVideoPost(p))
  const videos = allSocial.filter((p) => isVideoPost(p))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blogsRaw: any[] = seoSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d): any => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c: any) => c.deleted !== true)

  // Hydrate the draft for each blog if a draftPostId is set.
  const blogs = await Promise.all(
    blogsRaw.map(async (b) => {
      if (!b.draftPostId) return { ...b, draft: null }
      const draftSnap = await adminDb.collection('seo_drafts').doc(b.draftPostId).get()
      if (!draftSnap.exists) return { ...b, draft: null }
      const dd = draftSnap.data()!
      return {
        ...b,
        draft: {
          wordCount: dd.wordCount ?? 0,
          generatedBy: dd.generatedBy ?? 'unknown',
          body: dd.body,
          metaDescription: dd.metaDescription,
        },
      }
    }),
  )

  const byStatus = { draft: 0, pending_approval: 0, approved: 0, published: 0 }
  for (const p of allSocial) {
    if (p.status === 'draft') byStatus.draft++
    else if (p.status === 'pending_approval') byStatus.pending_approval++
    else if (p.status === 'approved') byStatus.approved++
    else if (p.status === 'published') byStatus.published++
  }
  for (const b of blogs) {
    if (b.status === 'idea' || b.status === 'review') byStatus.pending_approval++
    else if (b.status === 'live') byStatus.published++
    else if (b.status === 'draft') byStatus.draft++
  }

  return {
    campaignId,
    social,
    blogs,
    videos,
    meta: {
      totals: { social: social.length, blogs: blogs.length, videos: videos.length },
      byStatus,
    },
  }
}

export const GET = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const campaignSnap = await adminDb.collection('campaigns').doc(id).get()
  if (!campaignSnap.exists) return apiError('Campaign not found', 404)
  const campaign = campaignSnap.data()!
  if (campaign.deleted) return apiError('Campaign not found', 404)
  const scope = resolveOrgScope(user, (campaign.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const assets = await buildCampaignAssets(id)
  return apiSuccess(assets)
})
