/**
 * Sub-3a Phase 2 acceptance — Search campaign round-trip.
 *
 * Creates a Search campaign → ad group → RSA → adds 2 keywords (1 phrase, 1 campaign-negative)
 * → pauses campaign → cleans up (removes RSA, ad group, campaign).
 *
 * Requires:
 *   SMOKE_GOOGLE_ACCESS_TOKEN  — valid OAuth access token with adwords scope
 *   SMOKE_GOOGLE_DEVELOPER_TOKEN — your developer token
 *   SMOKE_GOOGLE_CUSTOMER_ID — 10-digit customer ID (no dashes)
 *   SMOKE_GOOGLE_LOGIN_CUSTOMER_ID (optional) — MCC ID if accessing via manager hierarchy
 *
 * Run: SMOKE_GOOGLE_ACCESS_TOKEN=ya29.xxx SMOKE_GOOGLE_DEVELOPER_TOKEN=xxx \
 *      SMOKE_GOOGLE_CUSTOMER_ID=1234567890 npx tsx scripts/smoke-ads-sub3a-phase2.ts
 */
import { createSearchCampaign, pauseCampaign, removeCampaign } from '@/lib/ads/providers/google/campaigns'
import { createAdGroup, removeAdGroup } from '@/lib/ads/providers/google/adgroups'
import { createResponsiveSearchAd, removeAdGroupAd, type RsaAssets } from '@/lib/ads/providers/google/ads'
import { addKeyword, addCampaignNegativeKeyword, removeCriterion } from '@/lib/ads/providers/google/keywords'
import { Timestamp } from 'firebase-admin/firestore'

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
  const campaignName = `[SMOKE Sub-3a P2] ${ts}`

  // Minimal canonical fixtures (only fields helpers read)
  const now = Timestamp.now()
  const canonicalCampaign: any = {
    id: 'smoke-campaign',
    orgId: 'smoke-org',
    platform: 'google',
    name: campaignName,
    status: 'PAUSED',  // ship paused so it doesn't spend during smoke
    objective: 'TRAFFIC',
    adAccountId: customerId,
    cboEnabled: false,
    specialAdCategories: [],
    providerData: {},
    createdBy: 'smoke',
    createdAt: now,
    updatedAt: now,
  }

  console.log(`\n1. Creating Search campaign "${campaignName}"…`)
  const campaign = await createSearchCampaign({
    ...callArgs,
    canonical: canonicalCampaign,
    dailyBudgetMajor: 1,  // $1/day — smallest reasonable budget for smoke
  })
  console.log(`   ✓ Campaign: ${campaign.resourceName}`)

  let adGroup: { resourceName: string; id: string } | null = null
  let rsaAd: { resourceName: string; id: string } | null = null
  let keyword1: { resourceName: string; id: string } | null = null
  let campaignNegative: { resourceName: string; id: string } | null = null

  try {
    console.log('\n2. Creating ad group…')
    const canonicalAdSet: any = {
      id: 'smoke-adset',
      orgId: 'smoke-org',
      platform: 'google',
      campaignId: campaign.id,
      name: 'Smoke ad group',
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
      defaultCpcBidMajor: 0.50,
    })
    console.log(`   ✓ Ad group: ${adGroup.resourceName}`)

    console.log('\n3. Creating Responsive Search Ad…')
    const rsaAssets: RsaAssets = {
      headlines: [
        { text: 'Smoke Test Ad' },
        { text: 'Partners in Biz Demo' },
        { text: 'Phase 2 Acceptance' },
      ],
      descriptions: [
        { text: 'This ad exists only to verify the Google Ads API integration works end-to-end.' },
        { text: 'It is paused and will be removed at the end of the smoke script.' },
      ],
      finalUrls: ['https://partnersinbiz.online/'],
    }
    const canonicalAd: any = {
      id: 'smoke-ad',
      orgId: 'smoke-org',
      platform: 'google',
      campaignId: campaign.id,
      adSetId: adGroup.id,
      name: 'Smoke RSA',
      status: 'PAUSED',
      format: 'SINGLE_IMAGE',
      providerData: {},
      createdAt: now,
      updatedAt: now,
    }
    rsaAd = await createResponsiveSearchAd({
      ...callArgs,
      adGroupResourceName: adGroup.resourceName,
      canonical: canonicalAd,
      rsaAssets,
    })
    console.log(`   ✓ RSA: ${rsaAd.resourceName}`)

    console.log('\n4. Adding 1 phrase keyword + 1 campaign-negative keyword…')
    keyword1 = await addKeyword({
      ...callArgs,
      adGroupResourceName: adGroup.resourceName,
      text: 'smoke test integration',
      matchType: 'PHRASE',
    })
    console.log(`   ✓ Phrase keyword: ${keyword1.resourceName}`)

    campaignNegative = await addCampaignNegativeKeyword({
      ...callArgs,
      campaignResourceName: campaign.resourceName,
      text: 'free',
      matchType: 'BROAD',
    })
    console.log(`   ✓ Campaign negative: ${campaignNegative.resourceName}`)

    console.log('\n5. Pausing campaign (already paused, but exercises the path)…')
    await pauseCampaign({ ...callArgs, resourceName: campaign.resourceName })
    console.log('   ✓ Campaign paused')

    console.log('\n🎉 Sub-3a Phase 2 acceptance: PASSED')
  } finally {
    console.log('\n6. Cleanup…')
    if (keyword1) {
      try { await removeCriterion({ ...callArgs, resourceName: keyword1.resourceName }); console.log('   ✓ Removed phrase keyword') } catch (e) { console.warn('   ! keyword cleanup:', (e as Error).message) }
    }
    if (campaignNegative) {
      try { await removeCriterion({ ...callArgs, resourceName: campaignNegative.resourceName }); console.log('   ✓ Removed campaign negative') } catch (e) { console.warn('   ! negative cleanup:', (e as Error).message) }
    }
    if (rsaAd) {
      try { await removeAdGroupAd({ ...callArgs, resourceName: rsaAd.resourceName }); console.log('   ✓ Removed RSA') } catch (e) { console.warn('   ! rsa cleanup:', (e as Error).message) }
    }
    if (adGroup) {
      try { await removeAdGroup({ ...callArgs, resourceName: adGroup.resourceName }); console.log('   ✓ Removed ad group') } catch (e) { console.warn('   ! adgroup cleanup:', (e as Error).message) }
    }
    try { await removeCampaign({ ...callArgs, resourceName: campaign.resourceName }); console.log('   ✓ Removed campaign') } catch (e) { console.warn('   ! campaign cleanup:', (e as Error).message) }
  }
}

main().catch((err) => { console.error('\n❌ FAILED', err); process.exit(1) })
