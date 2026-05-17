/**
 * Sub-3a Phase 4 acceptance — Shopping campaign round-trip.
 *
 * Creates a Shopping campaign (requires a linked Merchant Center account + feed label) →
 * SHOPPING_PRODUCT_ADS ad group → ProductAd → pauses → cleans up.
 *
 * Requires:
 *   SMOKE_GOOGLE_ACCESS_TOKEN — valid OAuth access token with adwords scope
 *   SMOKE_GOOGLE_DEVELOPER_TOKEN — developer token
 *   SMOKE_GOOGLE_CUSTOMER_ID — 10-digit customer ID (no dashes)
 *   SMOKE_GOOGLE_LOGIN_CUSTOMER_ID (optional) — MCC ID
 *   SMOKE_GOOGLE_MERCHANT_ID — Merchant Center account ID linked to the Customer
 *   SMOKE_GOOGLE_FEED_LABEL — feed label (e.g. 'US', 'ZA') matching a datafeed in the Merchant Center
 *
 * Run: SMOKE_GOOGLE_ACCESS_TOKEN=ya29.xxx SMOKE_GOOGLE_DEVELOPER_TOKEN=xxx \
 *      SMOKE_GOOGLE_CUSTOMER_ID=1234567890 SMOKE_GOOGLE_MERCHANT_ID=99999 \
 *      SMOKE_GOOGLE_FEED_LABEL=ZA npx tsx scripts/smoke-ads-sub3a-phase4.ts
 */
import { createShoppingCampaign, pauseShoppingCampaign, removeShoppingCampaign } from '@/lib/ads/providers/google/campaigns-shopping'
import { createAdGroup, removeAdGroup } from '@/lib/ads/providers/google/adgroups'
import { createProductAd, removeProductAd } from '@/lib/ads/providers/google/shopping-ads'
import { Timestamp } from 'firebase-admin/firestore'

async function main() {
  const accessToken = process.env.SMOKE_GOOGLE_ACCESS_TOKEN
  const developerToken = process.env.SMOKE_GOOGLE_DEVELOPER_TOKEN
  const customerId = process.env.SMOKE_GOOGLE_CUSTOMER_ID
  const loginCustomerId = process.env.SMOKE_GOOGLE_LOGIN_CUSTOMER_ID
  const merchantId = process.env.SMOKE_GOOGLE_MERCHANT_ID
  const feedLabel = process.env.SMOKE_GOOGLE_FEED_LABEL

  if (!accessToken || !developerToken || !customerId || !merchantId || !feedLabel) {
    console.log('Set SMOKE_GOOGLE_ACCESS_TOKEN + SMOKE_GOOGLE_DEVELOPER_TOKEN + SMOKE_GOOGLE_CUSTOMER_ID + SMOKE_GOOGLE_MERCHANT_ID + SMOKE_GOOGLE_FEED_LABEL to run')
    process.exit(0)
  }

  const callArgs = { customerId, accessToken, developerToken, loginCustomerId }

  const ts = new Date().toISOString()
  const campaignName = `[SMOKE Sub-3a P4 Shopping] ${ts}`

  const now = Timestamp.now()
  const canonicalCampaign: any = {
    id: 'smoke-s-campaign',
    orgId: 'smoke-org',
    platform: 'google',
    name: campaignName,
    status: 'PAUSED',
    objective: 'SALES',
    adAccountId: customerId,
    cboEnabled: false,
    specialAdCategories: [],
    providerData: {},
    createdBy: 'smoke',
    createdAt: now,
    updatedAt: now,
  }

  console.log(`\n1. Creating Shopping campaign "${campaignName}" (merchantId=${merchantId}, feedLabel=${feedLabel})…`)
  const campaign = await createShoppingCampaign({
    ...callArgs,
    canonical: canonicalCampaign,
    dailyBudgetMajor: 1,
    merchantId,
    feedLabel,
  })
  console.log(`   ✓ Campaign: ${campaign.resourceName}`)

  let adGroup: { resourceName: string; id: string } | null = null
  let productAd: { resourceName: string; id: string } | null = null

  try {
    console.log('\n2. Creating SHOPPING_PRODUCT_ADS ad group…')
    const canonicalAdSet: any = {
      id: 'smoke-s-adset',
      orgId: 'smoke-org',
      platform: 'google',
      campaignId: campaign.id,
      name: 'Smoke Shopping ad group',
      status: 'PAUSED',
      optimizationGoal: 'LINK_CLICKS',
      billingEvent: 'LINK_CLICKS',
      targeting: { geo: {}, demographics: {} },
      placements: [],
      providerData: {},
      createdAt: now,
      updatedAt: now,
    }
    adGroup = await createAdGroup({
      ...callArgs,
      campaignResourceName: campaign.resourceName,
      canonical: canonicalAdSet,
      defaultCpcBidMajor: 0.30,
      type: 'SHOPPING_PRODUCT_ADS',
    })
    console.log(`   ✓ Ad group: ${adGroup.resourceName}`)

    console.log('\n3. Creating ProductAd (no per-ad assets — sourced from feed)…')
    const canonicalAd: any = {
      id: 'smoke-s-ad',
      orgId: 'smoke-org',
      platform: 'google',
      campaignId: campaign.id,
      adSetId: adGroup.id,
      name: 'Smoke ProductAd',
      status: 'PAUSED',
      format: 'SINGLE_IMAGE',
      providerData: {},
      createdAt: now,
      updatedAt: now,
    }
    productAd = await createProductAd({
      ...callArgs,
      adGroupResourceName: adGroup.resourceName,
      canonical: canonicalAd,
    })
    console.log(`   ✓ ProductAd: ${productAd.resourceName}`)

    console.log('\n4. Pausing campaign (already paused, exercises the path)…')
    await pauseShoppingCampaign({ ...callArgs, resourceName: campaign.resourceName })
    console.log('   ✓ Campaign paused')

    console.log('\n🎉 Sub-3a Phase 4 acceptance: PASSED')
  } finally {
    console.log('\n5. Cleanup…')
    if (productAd) {
      try { await removeProductAd({ ...callArgs, resourceName: productAd.resourceName }); console.log('   ✓ Removed ProductAd') } catch (e) { console.warn('   ! productAd cleanup:', (e as Error).message) }
    }
    if (adGroup) {
      try { await removeAdGroup({ ...callArgs, resourceName: adGroup.resourceName }); console.log('   ✓ Removed ad group') } catch (e) { console.warn('   ! adgroup cleanup:', (e as Error).message) }
    }
    try { await removeShoppingCampaign({ ...callArgs, resourceName: campaign.resourceName }); console.log('   ✓ Removed campaign') } catch (e) { console.warn('   ! campaign cleanup:', (e as Error).message) }
  }
}

main().catch((err) => { console.error('\n❌ FAILED', err); process.exit(1) })
