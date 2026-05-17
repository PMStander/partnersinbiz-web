// app/api/v1/ads/campaigns/[id]/submit-for-review/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { setReviewState } from '@/lib/ads/approval'
import { logCampaignActivity } from '@/lib/ads/activity'
import { notifyAwaitingReview } from '@/lib/ads/notifications'
import { Timestamp } from 'firebase-admin/firestore'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const campaign = await getCampaign(id)
    if (!campaign || campaign.orgId !== orgId) return apiError('Campaign not found', 404)

    if (campaign.status !== 'DRAFT') {
      return apiError('Only DRAFT campaigns can be submitted for review', 400)
    }

    const uid = (user as { uid?: string }).uid ?? 'unknown'
    const email = (user as { email?: string }).email ?? 'Admin'

    await setReviewState({
      campaignId: id,
      newStatus: 'PENDING_REVIEW',
      newReviewState: 'awaiting',
      actorUid: uid,
      actorRole: 'admin',
      entryState: 'submitted',
      extraFields: {
        submittedForReviewAt: Timestamp.now(),
        submittedForReviewBy: uid,
      },
    })

    // Best-effort activity log — 'submitted_for_review' not in enum yet, use as any
    try {
      await logCampaignActivity({
        orgId,
        actor: { id: uid, name: email, role: 'admin' },
        action: 'submitted_for_review' as any,
        campaignId: id,
        campaignName: campaign.name,
      })
    } catch (err) {
      console.error('[submit-for-review] Activity log failed:', err)
    }

    // Best-effort notification — skip if no X-Org-Slug
    const orgSlug = req.headers.get('X-Org-Slug') ?? ''
    if (orgSlug) {
      try {
        await notifyAwaitingReview({
          orgId,
          orgSlug,
          campaignId: id,
          campaignName: campaign.name,
          submittedByName: email,
        })
      } catch (err) {
        console.error('[submit-for-review] Notification failed:', err)
      }
    }

    const updated = await getCampaign(id)
    return apiSuccess(updated)
  },
)
