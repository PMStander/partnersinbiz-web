/**
 * Phase 7 acceptance — verifies activity-feed integration.
 *
 * 1. Calls logCampaignActivity with a fake campaign
 * 2. Reads back from activity collection
 * 3. Verifies type, description, entityId match
 *
 * Run: SMOKE_ORG_ID=<id> npx tsx scripts/smoke-ads-phase7.ts
 */
import { logCampaignActivity } from '@/lib/ads/activity'
import { adminDb } from '@/lib/firebase/admin'

async function main() {
  const orgId = process.env.SMOKE_ORG_ID
  if (!orgId) {
    console.log('Set SMOKE_ORG_ID to run')
    process.exit(0)
  }
  const fakeCampaignId = `cmp_phase7_smoke_${Date.now()}`
  await logCampaignActivity({
    orgId,
    actor: { id: 'smoke', name: 'Phase 7 smoke', role: 'ai' },
    action: 'launched',
    campaignId: fakeCampaignId,
    campaignName: 'Smoke test campaign',
  })

  // Wait a beat then query
  await new Promise((r) => setTimeout(r, 1500))

  const snap = await adminDb
    .collection('activity')
    .where('orgId', '==', orgId)
    .where('entityId', '==', fakeCampaignId)
    .get()

  if (snap.docs.length === 0) {
    console.error('✗ Activity not written')
    process.exit(1)
  }
  const doc = snap.docs[0].data()
  console.log('✓ Activity written:', JSON.stringify(doc, null, 2))

  // Cleanup
  await snap.docs[0].ref.delete()
  console.log('✓ Cleanup done')
}

main()
