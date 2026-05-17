// lib/ads/approval.ts
// Bundles the approval-state flip + audit-history append into one atomic call.
// Used by: submit-for-review endpoint (Task 3), approve endpoint (Task 4c), reject endpoint (Task 4d).

import type { AdCampaign, AdCampaignApprovalEntry, AdEntityStatus, CampaignReviewState } from '@/lib/ads/types'
import { listCampaigns, updateCampaign } from '@/lib/ads/campaigns/store'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'

export async function setReviewState(args: {
  campaignId: string
  newStatus: AdEntityStatus
  newReviewState: CampaignReviewState
  actorUid: string
  actorRole: AdCampaignApprovalEntry['actorRole']
  entryState: AdCampaignApprovalEntry['state']
  reason?: string
  extraFields?: Partial<AdCampaign>
}): Promise<void> {
  const entry: AdCampaignApprovalEntry = {
    state: args.entryState,
    actorUid: args.actorUid,
    actorRole: args.actorRole,
    at: Timestamp.now(),
  }
  if (args.reason) entry.reason = args.reason

  await updateCampaign(args.campaignId, {
    status: args.newStatus,
    reviewState: args.newReviewState,
    approvalHistory: FieldValue.arrayUnion(entry) as any,
    ...args.extraFields,
  } as any)
}

/**
 * Bulk-approve every campaign in the org with reviewState === 'awaiting'.
 * Loops through them sequentially and calls setReviewState per campaign.
 * Per-campaign failures do not abort the batch — they're collected and returned.
 *
 * Returns `approvedCampaigns` (id + name pairs) so callers can fire follow-up
 * side effects (activity log, notifications) without re-fetching.
 */
export async function bulkSetReviewStateApprove(args: {
  orgId: string
  actorUid: string
  actorRole: 'admin' | 'member' | 'viewer' | 'owner'
}): Promise<{
  approved: string[]
  approvedCampaigns: { id: string; name: string }[]
  failed: { id: string; error: string }[]
}> {
  const all = await listCampaigns({ orgId: args.orgId })
  const awaiting = all.filter((c) => c.reviewState === 'awaiting')

  const approved: string[] = []
  const approvedCampaigns: { id: string; name: string }[] = []
  const failed: { id: string; error: string }[] = []

  for (const c of awaiting) {
    try {
      await setReviewState({
        campaignId: c.id,
        newStatus: 'PENDING_REVIEW',
        newReviewState: 'approved',
        actorUid: args.actorUid,
        actorRole: args.actorRole,
        entryState: 'approved',
        extraFields: {
          approvedAt: Timestamp.now(),
          approvedBy: args.actorUid,
        },
      })
      approved.push(c.id)
      approvedCampaigns.push({ id: c.id, name: c.name })
    } catch (err) {
      failed.push({ id: c.id, error: (err as Error).message })
    }
  }

  return { approved, approvedCampaigns, failed }
}
