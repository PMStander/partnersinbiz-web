// app/api/v1/portal/ads/campaigns/bulk-approve/route.ts
// Client-portal "Approve all" — flips every awaiting campaign in the org to approved.
// Mirrors the single-campaign approve route: setReviewState first, then best-effort
// activity log + notification PER approved campaign.
import { NextRequest } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { bulkSetReviewStateApprove } from '@/lib/ads/approval'
import { logCampaignActivity } from '@/lib/ads/activity'
import { notifyCampaignApproved } from '@/lib/ads/notifications'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

export const POST = withPortalAuthAndRole(
  'member',
  async (_req: NextRequest, uid: string, orgId: string, role: OrgRole) => {
    try {
      const result = await bulkSetReviewStateApprove({
        orgId,
        actorUid: uid,
        actorRole: role as 'admin' | 'member' | 'viewer' | 'owner',
      })

      // Best-effort activity + notification per approved campaign — mirror per-campaign approve route.
      for (const c of result.approvedCampaigns) {
        try {
          await logCampaignActivity({
            orgId,
            actor: { id: uid, name: 'Client', role: 'client' },
            action: 'approved' as any,
            campaignId: c.id,
            campaignName: c.name,
          })
        } catch (err) {
          console.error('[portal/bulk-approve] Activity log failed:', c.id, err)
        }

        try {
          await notifyCampaignApproved({
            orgId,
            orgSlug: '',
            campaignId: c.id,
            campaignName: c.name,
            approvedByName: 'Client',
          })
        } catch (err) {
          console.error('[portal/bulk-approve] Notification failed:', c.id, err)
        }
      }

      return apiSuccess({ approved: result.approved, failed: result.failed })
    } catch (err) {
      return apiError((err as Error).message ?? 'Bulk approve failed', 500)
    }
  },
) as any
