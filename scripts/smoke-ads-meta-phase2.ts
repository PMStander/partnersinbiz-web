// scripts/smoke-ads-meta-phase2.ts
/**
 * Phase 2 acceptance smoke test.
 *
 * Creates: 1 Campaign → 1 AdSet → 1 Ad, in PAUSED status (Meta-side),
 * pushes each to Meta, reads back to verify metaIds persisted,
 * then deletes everything (Meta delete first, then local delete).
 *
 * Prerequisites:
 *   - Phase 1 smoke succeeded (Meta connection exists with defaultAdAccountId)
 *   - SMOKE_ORG_ID, SMOKE_PAGE_ID, SMOKE_IMAGE_URL env vars set
 *
 * Run with:
 *   SMOKE_ORG_ID=<id> SMOKE_PAGE_ID=<page_id> SMOKE_IMAGE_URL=<jpg_url> npx tsx scripts/smoke-ads-meta-phase2.ts
 */
import { listConnections, decryptAccessToken } from '@/lib/ads/connections/store'
import {
  createCampaign as createLocalCampaign,
  getCampaign,
  setCampaignMetaId,
  deleteCampaign as deleteLocalCampaign,
} from '@/lib/ads/campaigns/store'
import {
  createAdSet as createLocalAdSet,
  getAdSet,
  setAdSetMetaId,
  deleteAdSet as deleteLocalAdSet,
} from '@/lib/ads/adsets/store'
import {
  createAd as createLocalAd,
  getAd,
  setAdMetaIds,
  deleteAd as deleteLocalAd,
} from '@/lib/ads/ads/store'
import { metaProvider } from '@/lib/ads/providers/meta'
import { deleteCampaign as deleteMetaCampaign } from '@/lib/ads/providers/meta/campaigns'
import { deleteAdSet as deleteMetaAdSet } from '@/lib/ads/providers/meta/adsets'
import { deleteAd as deleteMetaAd } from '@/lib/ads/providers/meta/ads'

function require_env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Set ${name} before running this script`)
  return v
}

async function main() {
  const orgId = require_env('SMOKE_ORG_ID')
  const pageId = require_env('SMOKE_PAGE_ID')
  const imageUrl = require_env('SMOKE_IMAGE_URL')

  const conns = await listConnections({ orgId })
  const meta = conns.find((c) => c.platform === 'meta')
  if (!meta) throw new Error(`No Meta connection on org ${orgId}. Run Phase 1 smoke first.`)
  if (!meta.defaultAdAccountId) throw new Error('Meta connection has no defaultAdAccountId set.')
  const accessToken = decryptAccessToken(meta)
  const adAccountId = meta.defaultAdAccountId
  console.log('✓ Meta connection ok:', meta.id, 'ad account', adAccountId)

  let localCampaignId: string | undefined
  let metaCampaignId: string | undefined
  let localAdSetId: string | undefined
  let metaAdSetId: string | undefined
  let localAdId: string | undefined
  let metaAdId: string | undefined
  let metaCreativeId: string | undefined

  try {
    // Step 1 — Local campaign
    const campaign = await createLocalCampaign({
      orgId,
      createdBy: 'smoke-script',
      input: {
        adAccountId,
        name: `[SMOKE] Phase 2 ${new Date().toISOString()}`,
        objective: 'TRAFFIC',
        status: 'DRAFT',
        cboEnabled: false,
        specialAdCategories: [],
        dailyBudget: 100, // $1.00 in cents; maps to PAUSED on Meta so no real spend
      },
    })
    localCampaignId = campaign.id
    console.log('✓ Local campaign created:', campaign.id)

    // Step 2 — Push campaign to Meta (DRAFT → PAUSED via mapper)
    const cmpRes = await metaProvider.upsertCampaign!({
      accessToken,
      adAccountId,
      campaign,
    })
    metaCampaignId = (cmpRes as { metaCampaignId: string }).metaCampaignId
    await setCampaignMetaId(campaign.id, metaCampaignId)
    console.log('✓ Pushed campaign to Meta:', metaCampaignId)

    // Step 3 — Local ad set
    const adSet = await createLocalAdSet({
      orgId,
      input: {
        campaignId: campaign.id,
        name: '[SMOKE] adset',
        status: 'DRAFT',
        optimizationGoal: 'LINK_CLICKS',
        billingEvent: 'IMPRESSIONS',
        targeting: {
          geo: { countries: ['US'] },
          demographics: { ageMin: 18, ageMax: 65 },
        },
        placements: { feeds: true, stories: true, reels: false, marketplace: false },
        dailyBudget: 100,
        bidAmount: 50,
      },
    })
    localAdSetId = adSet.id
    console.log('✓ Local adset created:', adSet.id)

    // Step 4 — Push ad set to Meta
    const setRes = await metaProvider.upsertAdSet!({
      accessToken,
      adAccountId,
      adSet,
      metaCampaignId,
    })
    metaAdSetId = (setRes as { metaAdSetId: string }).metaAdSetId
    await setAdSetMetaId(adSet.id, metaAdSetId)
    console.log('✓ Pushed adset to Meta:', metaAdSetId)

    // Step 5 — Local ad
    const ad = await createLocalAd({
      orgId,
      input: {
        adSetId: adSet.id,
        campaignId: campaign.id,
        name: '[SMOKE] ad',
        status: 'DRAFT',
        format: 'SINGLE_IMAGE',
        creativeIds: [],
        inlineImageUrl: imageUrl,
        copy: {
          primaryText: 'Phase 2 smoke',
          headline: 'PiB',
          callToAction: 'LEARN_MORE',
          destinationUrl: 'https://partnersinbiz.online',
        },
      },
    })
    localAdId = ad.id
    console.log('✓ Local ad created:', ad.id)

    // Step 6 — Push ad to Meta
    const adRes = await metaProvider.upsertAd!({
      accessToken,
      adAccountId,
      ad,
      metaAdSetId,
      pageId,
    })
    metaAdId = (adRes as { metaAdId: string; metaCreativeId: string }).metaAdId
    metaCreativeId = (adRes as { metaAdId: string; metaCreativeId: string }).metaCreativeId
    await setAdMetaIds(ad.id, { metaAdId, metaCreativeId })
    console.log('✓ Pushed ad to Meta:', metaAdId, 'creative', metaCreativeId)

    // Step 7 — Read-back verification
    const cmpReadback = await getCampaign(campaign.id)
    const adSetReadback = await getAdSet(adSet.id)
    const adReadback = await getAd(ad.id)

    const cmpMetaId = (cmpReadback?.providerData?.meta as { id?: string } | undefined)?.id
    const adSetMetaIdRb = (adSetReadback?.providerData?.meta as { id?: string } | undefined)?.id
    const adMetaIdRb = (adReadback?.providerData?.meta as { adId?: string } | undefined)?.adId

    if (cmpMetaId !== metaCampaignId) {
      throw new Error(`Campaign metaId did not persist (expected ${metaCampaignId}, got ${cmpMetaId})`)
    }
    if (adSetMetaIdRb !== metaAdSetId) {
      throw new Error(`AdSet metaId did not persist (expected ${metaAdSetId}, got ${adSetMetaIdRb})`)
    }
    if (adMetaIdRb !== metaAdId) {
      throw new Error(`Ad metaId did not persist (expected ${metaAdId}, got ${adMetaIdRb})`)
    }
    console.log('✓ All metaIds persisted correctly in Firestore')

    console.log('\nPhase 2 acceptance: PASSED')
  } catch (err) {
    console.error('\nPhase 2 acceptance: FAILED\n', err)
    process.exitCode = 1
  } finally {
    // Cleanup — best-effort, reverse order: ad → adset → campaign
    if (metaAdId) {
      try {
        await deleteMetaAd({ metaAdId, accessToken })
        console.log('✓ Deleted ad from Meta')
      } catch (e) {
        console.warn('⚠ Meta ad delete failed:', (e as Error).message)
      }
    }
    if (localAdId) {
      await deleteLocalAd(localAdId).catch(() => {})
      console.log('✓ Deleted local ad')
    }
    if (metaAdSetId) {
      try {
        await deleteMetaAdSet({ metaAdSetId, accessToken })
        console.log('✓ Deleted adset from Meta')
      } catch (e) {
        console.warn('⚠ Meta adset delete failed:', (e as Error).message)
      }
    }
    if (localAdSetId) {
      await deleteLocalAdSet(localAdSetId).catch(() => {})
      console.log('✓ Deleted local adset')
    }
    if (metaCampaignId) {
      try {
        await deleteMetaCampaign({ metaCampaignId, accessToken })
        console.log('✓ Deleted campaign from Meta')
      } catch (e) {
        console.warn('⚠ Meta campaign delete failed:', (e as Error).message)
      }
    }
    if (localCampaignId) {
      await deleteLocalCampaign(localCampaignId).catch(() => {})
      console.log('✓ Deleted local campaign')
    }
  }
}

main()
