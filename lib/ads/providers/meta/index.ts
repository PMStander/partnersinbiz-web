// lib/ads/providers/meta/index.ts
import type { AdProvider } from '@/lib/ads/provider'
import { buildAuthorizeUrl, exchangeCode, exchangeForLongLived, refresh } from './oauth'
import { listAdAccounts as listMetaAdAccounts } from './client'
import * as campaigns from './campaigns'
import * as adsets from './adsets'
import * as ads from './ads'
import { ensureSynced } from './creative-sync'
import type { AdCampaign, AdSet, Ad } from '@/lib/ads/types'

export const metaProvider: AdProvider = {
  platform: 'meta',
  getAuthorizeUrl: buildAuthorizeUrl,
  exchangeCodeForToken: exchangeCode,
  toLongLivedToken: exchangeForLongLived,
  refreshToken: refresh,
  listAdAccounts: listMetaAdAccounts,

  // Phase 2 — campaigns/adsets/ads dispatching upsert by metaId presence
  async upsertCampaign(args: {
    accessToken: string
    adAccountId: string
    campaign: AdCampaign
    validateOnly?: boolean
  }) {
    const existingMetaId = (args.campaign.providerData?.meta as { id?: string } | undefined)?.id
    if (!existingMetaId) {
      const r = await campaigns.createCampaign({
        adAccountId: args.adAccountId,
        accessToken: args.accessToken,
        campaign: args.campaign,
      })
      return { metaCampaignId: r.metaCampaignId, created: true }
    }
    await campaigns.updateCampaign({
      metaCampaignId: existingMetaId,
      accessToken: args.accessToken,
      patch: args.campaign,
      validateOnly: args.validateOnly,
    })
    return { metaCampaignId: existingMetaId, created: false }
  },

  async upsertAdSet(args: {
    accessToken: string
    adAccountId: string
    adSet: AdSet
    metaCampaignId: string
    validateOnly?: boolean
  }) {
    const existingMetaId = (args.adSet.providerData?.meta as { id?: string } | undefined)?.id
    if (!existingMetaId) {
      const r = await adsets.createAdSet({
        adAccountId: args.adAccountId,
        accessToken: args.accessToken,
        adSet: args.adSet,
        metaCampaignId: args.metaCampaignId,
      })
      return { metaAdSetId: r.metaAdSetId, created: true }
    }
    await adsets.updateAdSet({
      metaAdSetId: existingMetaId,
      accessToken: args.accessToken,
      patch: args.adSet,
      validateOnly: args.validateOnly,
    })
    return { metaAdSetId: existingMetaId, created: false }
  },

  async upsertAd(args: {
    accessToken: string
    adAccountId: string
    ad: Ad
    metaAdSetId: string
    pageId: string
    validateOnly?: boolean
  }) {
    const existingMetaId = (args.ad.providerData?.meta as { id?: string } | undefined)?.id
    if (existingMetaId) {
      await ads.updateAd({
        metaAdId: existingMetaId,
        accessToken: args.accessToken,
        patch: args.ad,
        validateOnly: args.validateOnly,
      })
      return { metaAdId: existingMetaId, created: false }
    }

    // Phase 3: if ad references canonical creatives, resolve them first via ensureSynced
    let preResolvedImageHashes: string[] | undefined
    if (args.ad.creativeIds.length > 0) {
      const { getCreative } = await import('@/lib/ads/creatives/store')
      const hashes: string[] = []
      for (const creativeId of args.ad.creativeIds) {
        const creative = await getCreative(creativeId)
        if (!creative) throw new Error(`Creative ${creativeId} not found`)
        if (creative.orgId !== args.ad.orgId) throw new Error(`Creative ${creativeId} not in org ${args.ad.orgId}`)
        const synced = await ensureSynced({
          orgId: args.ad.orgId,
          adAccountId: args.adAccountId,
          accessToken: args.accessToken,
          creative,
        })
        hashes.push(synced.metaCreativeId)
      }
      preResolvedImageHashes = hashes
    }

    // Phase 2 fallback: if no creativeIds, ads.createAd handles inlineImageUrl
    const r = await ads.createAd({
      adAccountId: args.adAccountId,
      accessToken: args.accessToken,
      ad: args.ad,
      metaAdSetId: args.metaAdSetId,
      pageId: args.pageId,
      preResolvedImageHashes,
    })
    return { metaAdId: r.metaAdId, metaCreativeId: r.metaCreativeId, created: true }
  },

  async syncCreative(args: {
    orgId: string
    adAccountId: string
    accessToken: string
    creative: import('@/lib/ads/types').AdCreative
  }) {
    return ensureSynced(args)
  },

  async validateBeforeLaunch(args: {
    accessToken: string
    level: 'campaign' | 'adset' | 'ad'
    metaId: string
    patch: Partial<AdCampaign> | Partial<AdSet> | Partial<Ad>
  }) {
    if (args.level === 'campaign') {
      return campaigns.validateCampaign({
        metaCampaignId: args.metaId,
        accessToken: args.accessToken,
        patch: args.patch as Partial<AdCampaign>,
      })
    }
    if (args.level === 'adset') {
      return adsets.validateAdSet({
        metaAdSetId: args.metaId,
        accessToken: args.accessToken,
        patch: args.patch as Partial<AdSet>,
      })
    }
    return ads.validateAd({
      metaAdId: args.metaId,
      accessToken: args.accessToken,
      patch: args.patch as Partial<Ad>,
    })
  },
}
