/**
 * Sub-project 2 Phase 1 acceptance — submit → approve round-trip.
 *
 * Creates a DRAFT campaign → submits for review → approves → asserts state transitions
 * and approvalHistory grows to 2 entries. Does NOT push to Meta — pure Firestore exercise
 * of the approval-flow store layer.
 *
 * Run: SMOKE_ORG_ID=<orgId> npx tsx scripts/smoke-ads-sub2.ts
 */
import { createCampaign, getCampaign, deleteCampaign } from '@/lib/ads/campaigns/store'
import { setReviewState } from '@/lib/ads/approval'
import { Timestamp } from 'firebase-admin/firestore'

async function main() {
  const orgId = process.env.SMOKE_ORG_ID
  if (!orgId) {
    console.log('Set SMOKE_ORG_ID env var to run')
    process.exit(0)
  }

  console.log('1. Creating DRAFT campaign in org', orgId)
  const campaign = await createCampaign({
    orgId,
    createdBy: 'smoke-sub2',
    input: {
      adAccountId: 'act_smoke',
      name: `[SMOKE Sub-2] ${new Date().toISOString()}`,
      objective: 'TRAFFIC',
      status: 'DRAFT',
      cboEnabled: false,
      specialAdCategories: [],
    },
  })
  console.log('   ✓ Created:', campaign.id)

  try {
    console.log('2. Submitting for review')
    await setReviewState({
      campaignId: campaign.id,
      newStatus: 'PENDING_REVIEW',
      newReviewState: 'awaiting',
      actorUid: 'smoke-admin',
      actorRole: 'admin',
      entryState: 'submitted',
      extraFields: {
        submittedForReviewAt: Timestamp.now(),
        submittedForReviewBy: 'smoke-admin',
      },
    })
    const after1 = await getCampaign(campaign.id)
    if (!after1) throw new Error('Campaign disappeared after submit')
    if (after1.status !== 'PENDING_REVIEW')
      throw new Error(`Expected status PENDING_REVIEW, got ${after1.status}`)
    if (after1.reviewState !== 'awaiting')
      throw new Error(`Expected reviewState awaiting, got ${after1.reviewState}`)
    console.log('   ✓ status=PENDING_REVIEW, reviewState=awaiting')

    console.log('3. Approving as client')
    await setReviewState({
      campaignId: campaign.id,
      newStatus: 'PENDING_REVIEW', // stays pending — admin Launch flips to ACTIVE later
      newReviewState: 'approved',
      actorUid: 'smoke-client',
      actorRole: 'member',
      entryState: 'approved',
      extraFields: {
        approvedAt: Timestamp.now(),
        approvedBy: 'smoke-client',
      },
    })
    const after2 = await getCampaign(campaign.id)
    if (!after2) throw new Error('Campaign disappeared after approve')
    if (after2.reviewState !== 'approved')
      throw new Error(`Expected reviewState approved, got ${after2.reviewState}`)
    if (!after2.approvalHistory || after2.approvalHistory.length < 2) {
      throw new Error(
        `Expected approvalHistory length >= 2, got ${after2.approvalHistory?.length ?? 0}`,
      )
    }
    console.log(
      '   ✓ reviewState=approved, approvalHistory length:',
      after2.approvalHistory.length,
    )

    console.log('\n🎉 Sub-2 Phase 1 acceptance: PASSED')
  } finally {
    console.log('4. Cleanup')
    await deleteCampaign(campaign.id)
    console.log('   ✓ Campaign deleted')
  }
}

main().catch((err) => {
  console.error('FAILED', err)
  process.exit(1)
})
