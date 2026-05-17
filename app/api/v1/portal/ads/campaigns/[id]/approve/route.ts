// app/api/v1/portal/ads/campaigns/[id]/approve/route.ts
import { NextRequest } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { setReviewState } from '@/lib/ads/approval'
import { logCampaignActivity } from '@/lib/ads/activity'
import { notifyCampaignApproved } from '@/lib/ads/notifications'
import { Timestamp } from 'firebase-admin/firestore'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withPortalAuthAndRole(
  'member',
  async (req: NextRequest, uid: string, orgId: string, role: OrgRole, ctx?: unknown) => {
    const { id } = await (ctx as Ctx).params

    const campaign = await getCampaign(id)
    if (!campaign || campaign.orgId !== orgId) return apiError('Campaign not found', 404)

    if (campaign.reviewState !== 'awaiting') {
      return apiError('Nothing to approve', 400)
    }

    await setReviewState({
      campaignId: id,
      newStatus: 'PENDING_REVIEW',
      newReviewState: 'approved',
      actorUid: uid,
      actorRole: role as 'admin' | 'member' | 'viewer' | 'owner',
      entryState: 'approved',
      extraFields: {
        approvedAt: Timestamp.now(),
        approvedBy: uid,
      },
    })

    // Best-effort activity log
    try {
      await logCampaignActivity({
        orgId,
        actor: { id: uid, name: 'Client', role: 'client' },
        action: 'approved' as any,
        campaignId: id,
        campaignName: campaign.name,
      })
    } catch (err) {
      console.error('[portal/approve] Activity log failed:', err)
    }

    // Best-effort notification — orgSlug not available in portal auth; pass empty
    try {
      await notifyCampaignApproved({
        orgId,
        orgSlug: '',
        campaignId: id,
        campaignName: campaign.name,
        approvedByName: 'Client',
      })
    } catch (err) {
      console.error('[portal/approve] Notification failed:', err)
    }

    const updated = await getCampaign(id)
    return apiSuccess(updated)
  },
) as any
