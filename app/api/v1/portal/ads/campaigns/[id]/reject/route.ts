// app/api/v1/portal/ads/campaigns/[id]/reject/route.ts
import { NextRequest } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCampaign } from '@/lib/ads/campaigns/store'
import { setReviewState } from '@/lib/ads/approval'
import { logCampaignActivity } from '@/lib/ads/activity'
import { notifyCampaignRejected } from '@/lib/ads/notifications'
import { Timestamp } from 'firebase-admin/firestore'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withPortalAuthAndRole(
  'member',
  async (req: NextRequest, uid: string, orgId: string, role: OrgRole, ctx?: unknown) => {
    const { id } = await (ctx as Ctx).params

    // Body validation
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return apiError('Invalid JSON body', 400)
    }

    const reason = (body as Record<string, unknown>)?.reason
    if (typeof reason !== 'string' || reason.length < 10 || reason.length > 500) {
      return apiError('reason must be a string between 10 and 500 characters', 400)
    }

    // Tenant isolation
    const campaign = await getCampaign(id)
    if (!campaign || campaign.orgId !== orgId) return apiError('Campaign not found', 404)

    // Review-state guard
    if (campaign.reviewState !== 'awaiting') {
      return apiError('Campaign is not awaiting review', 400)
    }

    // Flip status back to DRAFT — admin can edit + re-submit
    await setReviewState({
      campaignId: id,
      newStatus: 'DRAFT',
      newReviewState: 'rejected',
      actorUid: uid,
      actorRole: role as 'admin' | 'member' | 'viewer' | 'owner',
      entryState: 'rejected',
      reason,
      extraFields: {
        rejectedAt: Timestamp.now(),
        rejectedBy: uid,
        rejectionReason: reason,
      },
    })

    // Best-effort activity log
    try {
      await logCampaignActivity({
        orgId,
        actor: { id: uid, name: uid, role: 'client' },
        action: 'rejected' as any,
        campaignId: id,
        campaignName: campaign.name,
      })
    } catch (err) {
      console.error('[reject] Activity log failed:', err)
    }

    // Best-effort notification to PiB managers
    try {
      await notifyCampaignRejected({
        orgId,
        orgSlug: '',
        campaignId: id,
        campaignName: campaign.name,
        rejectedByName: uid,
        reason,
      })
    } catch (err) {
      console.error('[reject] Notification failed:', err)
    }

    const updated = await getCampaign(id)
    return apiSuccess(updated)
  },
) as any
