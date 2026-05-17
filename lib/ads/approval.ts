// lib/ads/approval.ts
// Bundles the approval-state flip + audit-history append into one atomic call.
// Used by: submit-for-review endpoint (Task 3), approve endpoint (Task 4c), reject endpoint (Task 4d).

import type { AdCampaign, AdCampaignApprovalEntry, AdEntityStatus, CampaignReviewState } from '@/lib/ads/types'
import { updateCampaign } from '@/lib/ads/campaigns/store'
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
