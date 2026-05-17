/**
 * Sub-3a Phase 5 acceptance — Google audience subtypes round-trip.
 *
 * Creates a Customer Match list → uploads 2 hashed members → creates a Remarketing
 * list with a URL_CONTAINS rule → lists Affinity audiences → cleans up the created lists.
 *
 * Requires:
 *   SMOKE_GOOGLE_ACCESS_TOKEN — valid OAuth access token with adwords scope
 *   SMOKE_GOOGLE_DEVELOPER_TOKEN — developer token
 *   SMOKE_GOOGLE_CUSTOMER_ID — 10-digit customer ID (no dashes)
 *   SMOKE_GOOGLE_LOGIN_CUSTOMER_ID (optional) — MCC ID
 *
 * Run: SMOKE_GOOGLE_ACCESS_TOKEN=ya29.xxx SMOKE_GOOGLE_DEVELOPER_TOKEN=xxx \
 *      SMOKE_GOOGLE_CUSTOMER_ID=1234567890 npx tsx scripts/smoke-ads-sub3a-phase5.ts
 */
import {
  createCustomerMatchList,
  uploadCustomerListMembers,
  removeCustomerMatchList,
} from '@/lib/ads/providers/google/audiences/customer-match'
import {
  createRemarketingList,
  removeRemarketingList,
} from '@/lib/ads/providers/google/audiences/remarketing'
import { listAffinityAudiences } from '@/lib/ads/providers/google/audiences/browse-predefined'

async function main() {
  const accessToken = process.env.SMOKE_GOOGLE_ACCESS_TOKEN
  const developerToken = process.env.SMOKE_GOOGLE_DEVELOPER_TOKEN
  const customerId = process.env.SMOKE_GOOGLE_CUSTOMER_ID
  const loginCustomerId = process.env.SMOKE_GOOGLE_LOGIN_CUSTOMER_ID

  if (!accessToken || !developerToken || !customerId) {
    console.log('Set SMOKE_GOOGLE_ACCESS_TOKEN + SMOKE_GOOGLE_DEVELOPER_TOKEN + SMOKE_GOOGLE_CUSTOMER_ID to run')
    process.exit(0)
  }

  const callArgs = { customerId, accessToken, developerToken, loginCustomerId }
  const ts = new Date().toISOString()

  let customerMatchList: { resourceName: string; id: string } | null = null
  let remarketingList: { resourceName: string; id: string } | null = null

  try {
    console.log(`\n1. Creating Customer Match list "[SMOKE P5] CM ${ts}"…`)
    customerMatchList = await createCustomerMatchList({
      ...callArgs,
      name: `[SMOKE P5] CM ${ts}`,
      description: 'Phase 5 smoke — auto-cleaned',
      membershipLifeSpanDays: 540,
    })
    console.log(`   ✓ Customer Match list: ${customerMatchList.resourceName}`)

    console.log('\n2. Uploading 2 hashed members…')
    const uploadResult = await uploadCustomerListMembers({
      ...callArgs,
      userListResourceName: customerMatchList.resourceName,
      members: [
        { email: 'smoke-test-1@partnersinbiz.online' },
        { email: 'smoke-test-2@partnersinbiz.online', phone: '+27821234567' },
      ],
    })
    console.log(`   ✓ Upload job: ${uploadResult.jobResourceName} (${uploadResult.memberCount} members)`)

    console.log(`\n3. Creating Remarketing list "[SMOKE P5] RM ${ts}"…`)
    remarketingList = await createRemarketingList({
      ...callArgs,
      name: `[SMOKE P5] RM ${ts}`,
      description: 'Phase 5 smoke — auto-cleaned',
      membershipLifeSpanDays: 30,
      rule: { kind: 'URL_CONTAINS', value: 'partnersinbiz' },
    })
    console.log(`   ✓ Remarketing list: ${remarketingList.resourceName}`)

    console.log('\n4. Listing Affinity audiences (showing first 5)…')
    const affinity = await listAffinityAudiences(callArgs)
    console.log(`   ✓ Got ${affinity.length} Affinity audiences total`)
    affinity.slice(0, 5).forEach((a) => console.log(`     - ${a.name}`))

    console.log('\n🎉 Sub-3a Phase 5 acceptance: PASSED')
  } finally {
    console.log('\n5. Cleanup…')
    if (customerMatchList) {
      try { await removeCustomerMatchList({ ...callArgs, resourceName: customerMatchList.resourceName }); console.log('   ✓ Removed Customer Match list') } catch (e) { console.warn('   ! CM cleanup:', (e as Error).message) }
    }
    if (remarketingList) {
      try { await removeRemarketingList({ ...callArgs, resourceName: remarketingList.resourceName }); console.log('   ✓ Removed Remarketing list') } catch (e) { console.warn('   ! RM cleanup:', (e as Error).message) }
    }
  }
}

main().catch((err) => { console.error('\n❌ FAILED', err); process.exit(1) })
