/**
 * Phase 3 acceptance smoke test.
 *
 * Creates a canonical AdCreative, verifies Meta sync (and cache hit on retry),
 * then runs Phase 2-style flow using creativeIds instead of inlineImageUrl.
 *
 * Run with: SMOKE_ORG_ID=<id> SMOKE_PAGE_ID=<page_id> SMOKE_IMAGE_URL=<jpg_url> \
 *           npx tsx scripts/smoke-ads-meta-phase3.ts
 */
import { listConnections, decryptAccessToken } from '@/lib/ads/connections/store'
import {
  createCreative,
  getCreative,
  archiveCreative,
} from '@/lib/ads/creatives/store'
import {
  createCampaign as createLocalCampaign,
  setCampaignMetaId,
  deleteCampaign as deleteLocalCampaign,
} from '@/lib/ads/campaigns/store'
import {
  createAdSet as createLocalAdSet,
  setAdSetMetaId,
  deleteAdSet as deleteLocalAdSet,
} from '@/lib/ads/adsets/store'
import {
  createAd as createLocalAd,
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

  let creativeId: string | undefined
  let localCampaignId: string | undefined
  let metaCampaignId: string | undefined
  let localAdSetId: string | undefined
  let metaAdSetId: string | undefined
  let localAdId: string | undefined
  let metaAdId: string | undefined

  try {
    // 1. Canonical creative
    const creative = await createCreative({
      orgId,
      createdBy: 'smoke-script',
      input: {
        type: 'image',
        name: `[SMOKE-P3] Creative ${new Date().toISOString()}`,
        storagePath: 'phase3-smoke/external',
        sourceUrl: imageUrl,
        fileSize: 0, // unknown for external URL
        mimeType: 'image/jpeg',
        status: 'READY',
      },
    })
    creativeId = creative.id
    console.log('✓ Local creative created:', creative.id)

    // 2. Sync to Meta
    const sync1 = await metaProvider.syncCreative!({
      orgId,
      adAccountId,
      accessToken,
      creative,
    })
    const synced1 = sync1 as { metaCreativeId: string; alreadySynced: boolean }
    console.log('✓ Synced to Meta:', synced1.metaCreativeId, 'alreadySynced:', synced1.alreadySynced)
    if (synced1.alreadySynced) throw new Error('First sync should be alreadySynced=false')

    // 3. Re-sync — should be cache hit
    const creativeAfter = await getCreative(creative.id)
    const sync2 = await metaProvider.syncCreative!({
      orgId,
      adAccountId,
      accessToken,
      creative: creativeAfter!,
    })
    const synced2 = sync2 as { metaCreativeId: string; alreadySynced: boolean }
    if (!synced2.alreadySynced) throw new Error('Second sync should be alreadySynced=true (cache hit)')
    if (synced2.metaCreativeId !== synced1.metaCreativeId) throw new Error('Cached creativeId mismatch')
    console.log('✓ Cache hit on re-sync:', synced2.metaCreativeId)

    // 4. Build campaign + adset + ad using creativeIds (no inlineImageUrl)
    const campaign = await createLocalCampaign({
      orgId,
      createdBy: 'smoke-script',
      input: {
        adAccountId,
        name: `[SMOKE-P3] Campaign ${new Date().toISOString()}`,
        objective: 'TRAFFIC',
        status: 'DRAFT',
        cboEnabled: false,
        specialAdCategories: [],
        dailyBudget: 100,
      },
    })
    localCampaignId = campaign.id
    const cmpRes = await metaProvider.upsertCampaign!({
      accessToken,
      adAccountId,
      campaign,
    })
    metaCampaignId = (cmpRes as { metaCampaignId: string }).metaCampaignId
    await setCampaignMetaId(campaign.id, metaCampaignId)
    console.log('✓ Campaign pushed to Meta:', metaCampaignId)

    const adSet = await createLocalAdSet({
      orgId,
      input: {
        campaignId: campaign.id,
        name: '[SMOKE-P3] adset',
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
    const setRes = await metaProvider.upsertAdSet!({
      accessToken,
      adAccountId,
      adSet,
      metaCampaignId,
    })
    metaAdSetId = (setRes as { metaAdSetId: string }).metaAdSetId
    await setAdSetMetaId(adSet.id, metaAdSetId)
    console.log('✓ AdSet pushed to Meta:', metaAdSetId)

    // 5. Ad using creativeIds (KEY DIFFERENCE from Phase 2 smoke — no inlineImageUrl)
    const ad = await createLocalAd({
      orgId,
      input: {
        adSetId: adSet.id,
        campaignId: campaign.id,
        name: '[SMOKE-P3] ad',
        status: 'DRAFT',
        format: 'SINGLE_IMAGE',
        creativeIds: [creative.id], // Phase 3: canonical reference
        copy: {
          primaryText: 'Phase 3 smoke',
          headline: 'PiB',
          callToAction: 'LEARN_MORE',
          destinationUrl: 'https://partnersinbiz.online',
        },
      },
    })
    localAdId = ad.id
    const adRes = await metaProvider.upsertAd!({
      accessToken,
      adAccountId,
      ad,
      metaAdSetId,
      pageId,
    })
    metaAdId = (adRes as { metaAdId: string }).metaAdId
    const metaCreativeIdFromAd = (adRes as { metaCreativeId: string }).metaCreativeId
    await setAdMetaIds(ad.id, { metaAdId, metaCreativeId: metaCreativeIdFromAd })
    console.log('✓ Ad pushed to Meta:', metaAdId, '(creative:', metaCreativeIdFromAd, ')')

    console.log('\nPhase 3 acceptance: PASSED')
  } catch (err) {
    console.error('Phase 3 acceptance: FAILED\n', err)
    process.exitCode = 1
  } finally {
    // Cleanup — reverse order
    if (metaAdId) {
      try { await deleteMetaAd({ metaAdId, accessToken: '' }) } catch (e) { console.warn('⚠ Meta ad delete:', (e as Error).message) }
    }
    if (localAdId) await deleteLocalAd(localAdId).catch(() => {})
    if (metaAdSetId) {
      try { await deleteMetaAdSet({ metaAdSetId, accessToken: '' }) } catch (e) { console.warn('⚠ Meta adset delete:', (e as Error).message) }
    }
    if (localAdSetId) await deleteLocalAdSet(localAdSetId).catch(() => {})
    if (metaCampaignId) {
      try { await deleteMetaCampaign({ metaCampaignId, accessToken: '' }) } catch (e) { console.warn('⚠ Meta cmp delete:', (e as Error).message) }
    }
    if (localCampaignId) await deleteLocalCampaign(localCampaignId).catch(() => {})
    if (creativeId) {
      await archiveCreative(creativeId).catch(() => {})
      console.log('✓ Archived creative locally (Meta creative_id leaks — they auto-expire)')
    }
  }
}

main()
