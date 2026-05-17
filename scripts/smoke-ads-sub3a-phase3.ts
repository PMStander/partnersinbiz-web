/**
 * Sub-3a Phase 3 acceptance — Display campaign round-trip.
 *
 * Creates a Display campaign → DISPLAY_STANDARD ad group → RDA → adds 1 audience
 * criterion → pauses campaign → cleans up (removes criterion, RDA, ad group, campaign).
 *
 * Requires:
 *   SMOKE_GOOGLE_ACCESS_TOKEN — valid OAuth access token with adwords scope
 *   SMOKE_GOOGLE_DEVELOPER_TOKEN — your developer token
 *   SMOKE_GOOGLE_CUSTOMER_ID — 10-digit customer ID (no dashes)
 *   SMOKE_GOOGLE_LOGIN_CUSTOMER_ID (optional) — MCC ID
 *   SMOKE_GOOGLE_AUDIENCE_RESOURCE_NAME — e.g. 'customers/{cid}/userInterests/92938' for an in-market audience
 *     (Audiences API not yet wired — pick a known in-market or affinity ID from your account.
 *      Skip this step if env var absent.)
 *
 * Run: SMOKE_GOOGLE_ACCESS_TOKEN=ya29.xxx SMOKE_GOOGLE_DEVELOPER_TOKEN=xxx \
 *      SMOKE_GOOGLE_CUSTOMER_ID=1234567890 npx tsx scripts/smoke-ads-sub3a-phase3.ts
 */
import { createDisplayCampaign, pauseDisplayCampaign, removeDisplayCampaign } from '@/lib/ads/providers/google/campaigns-display'
import { createAdGroup, removeAdGroup } from '@/lib/ads/providers/google/adgroups'
import { createResponsiveDisplayAd, removeAdGroupAd } from '@/lib/ads/providers/google/display-ads'
import { addAudienceCriterion, removeCriterion } from '@/lib/ads/providers/google/display-targeting'
import { type RdaAssets } from '@/lib/ads/providers/google/display-types'
import { Timestamp } from 'firebase-admin/firestore'

async function main() {
  const accessToken = process.env.SMOKE_GOOGLE_ACCESS_TOKEN
  const developerToken = process.env.SMOKE_GOOGLE_DEVELOPER_TOKEN
  const customerId = process.env.SMOKE_GOOGLE_CUSTOMER_ID
  const loginCustomerId = process.env.SMOKE_GOOGLE_LOGIN_CUSTOMER_ID
  const audienceResourceName = process.env.SMOKE_GOOGLE_AUDIENCE_RESOURCE_NAME

  if (!accessToken || !developerToken || !customerId) {
    console.log('Set SMOKE_GOOGLE_ACCESS_TOKEN + SMOKE_GOOGLE_DEVELOPER_TOKEN + SMOKE_GOOGLE_CUSTOMER_ID to run')
    process.exit(0)
  }

  const callArgs = { customerId, accessToken, developerToken, loginCustomerId }

  const ts = new Date().toISOString()
  const campaignName = `[SMOKE Sub-3a P3 Display] ${ts}`

  const now = Timestamp.now()
  const canonicalCampaign: any = {
    id: 'smoke-d-campaign',
    orgId: 'smoke-org',
    platform: 'google',
    name: campaignName,
    status: 'PAUSED',
    objective: 'AWARENESS',
    adAccountId: customerId,
    cboEnabled: false,
    specialAdCategories: [],
    providerData: {},
    createdBy: 'smoke',
    createdAt: now,
    updatedAt: now,
  }

  console.log(`\n1. Creating Display campaign "${campaignName}"…`)
  const campaign = await createDisplayCampaign({
    ...callArgs,
    canonical: canonicalCampaign,
    dailyBudgetMajor: 1,  // $1/day for smoke
  })
  console.log(`   ✓ Campaign: ${campaign.resourceName}`)

  let adGroup: { resourceName: string; id: string } | null = null
  let rda: { resourceName: string; id: string } | null = null
  let audienceCriterion: { resourceName: string; id: string } | null = null

  try {
    console.log('\n2. Creating Display ad group (DISPLAY_STANDARD)…')
    const canonicalAdSet: any = {
      id: 'smoke-d-adset',
      orgId: 'smoke-org',
      platform: 'google',
      campaignId: campaign.id,
      name: 'Smoke Display ad group',
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
      type: 'DISPLAY_STANDARD',
    })
    console.log(`   ✓ Ad group: ${adGroup.resourceName}`)

    console.log('\n3. Creating Responsive Display Ad…')
    const rdaAssets: RdaAssets = {
      marketingImages: ['https://partnersinbiz.online/og.png'],   // 600x315 min
      squareMarketingImages: ['https://partnersinbiz.online/og-square.png'],  // 300x300 min
      headlines: ['Partners in Biz'],
      longHeadlines: ['Smoke test long headline for the Display ad acceptance'],
      descriptions: ['Smoke description for the Phase 3 Display ad acceptance round-trip.'],
      businessName: 'Partners in Biz',
      finalUrls: ['https://partnersinbiz.online/'],
    }
    const canonicalAd: any = {
      id: 'smoke-d-ad',
      orgId: 'smoke-org',
      platform: 'google',
      campaignId: campaign.id,
      adSetId: adGroup.id,
      name: 'Smoke RDA',
      status: 'PAUSED',
      format: 'SINGLE_IMAGE',
      providerData: {},
      createdAt: now,
      updatedAt: now,
    }
    rda = await createResponsiveDisplayAd({
      ...callArgs,
      adGroupResourceName: adGroup.resourceName,
      canonical: canonicalAd,
      rdaAssets,
    })
    console.log(`   ✓ RDA: ${rda.resourceName}`)

    if (audienceResourceName) {
      console.log(`\n4. Adding audience criterion (${audienceResourceName})…`)
      audienceCriterion = await addAudienceCriterion({
        ...callArgs,
        adGroupResourceName: adGroup.resourceName,
        audienceResourceName,
      })
      console.log(`   ✓ Audience criterion: ${audienceCriterion.resourceName}`)
    } else {
      console.log('\n4. Skipped audience criterion (set SMOKE_GOOGLE_AUDIENCE_RESOURCE_NAME to test)')
    }

    console.log('\n5. Pausing campaign (already paused, exercises the path)…')
    await pauseDisplayCampaign({ ...callArgs, resourceName: campaign.resourceName })
    console.log('   ✓ Campaign paused')

    console.log('\n🎉 Sub-3a Phase 3 acceptance: PASSED')
  } finally {
    console.log('\n6. Cleanup…')
    if (audienceCriterion) {
      try { await removeCriterion({ ...callArgs, resourceName: audienceCriterion.resourceName }); console.log('   ✓ Removed audience criterion') } catch (e) { console.warn('   ! audience cleanup:', (e as Error).message) }
    }
    if (rda) {
      try { await removeAdGroupAd({ ...callArgs, resourceName: rda.resourceName }); console.log('   ✓ Removed RDA') } catch (e) { console.warn('   ! rda cleanup:', (e as Error).message) }
    }
    if (adGroup) {
      try { await removeAdGroup({ ...callArgs, resourceName: adGroup.resourceName }); console.log('   ✓ Removed ad group') } catch (e) { console.warn('   ! adgroup cleanup:', (e as Error).message) }
    }
    try { await removeDisplayCampaign({ ...callArgs, resourceName: campaign.resourceName }); console.log('   ✓ Removed campaign') } catch (e) { console.warn('   ! campaign cleanup:', (e as Error).message) }
  }
}

main().catch((err) => { console.error('\n❌ FAILED', err); process.exit(1) })
