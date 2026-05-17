// lib/ads/providers/meta/index.ts
import type { AdProvider } from '@/lib/ads/provider'
import { buildAuthorizeUrl, exchangeCode, exchangeForLongLived, refresh } from './oauth'
import { listAdAccounts as listMetaAdAccounts } from './client'
import * as campaigns from './campaigns'
import * as adsets from './adsets'
import * as ads from './ads'
import * as caClient from './custom-audiences'
import * as saClient from './saved-audiences'
import { ensureSynced } from './creative-sync'
import type { AdCampaign, AdSet, Ad, AdCustomAudience, AdSavedAudience, AdTargeting } from '@/lib/ads/types'

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

  // Phase 4 — Custom Audiences
  async customAudienceCRUD(args: {
    op: 'create' | 'get' | 'list' | 'update' | 'delete' | 'upload-users'
    accessToken: string
    adAccountId?: string
    metaCaId?: string
    ca?: AdCustomAudience
    patch?: { name?: string; description?: string }
    uploadPayload?: { schema: string[]; hashedRows: string[][] }
    originMetaCaId?: string
  }) {
    switch (args.op) {
      case 'create':
        if (!args.adAccountId || !args.ca) throw new Error('create requires adAccountId + ca')
        return await caClient.createMetaCustomAudience({
          adAccountId: args.adAccountId,
          accessToken: args.accessToken,
          ca: args.ca,
          originMetaCaId: args.originMetaCaId,
        })
      case 'list':
        if (!args.adAccountId) throw new Error('list requires adAccountId')
        return await caClient.listMetaCustomAudiences({
          adAccountId: args.adAccountId,
          accessToken: args.accessToken,
        })
      case 'get':
        if (!args.metaCaId) throw new Error('get requires metaCaId')
        return await caClient.getMetaCustomAudience({
          metaCaId: args.metaCaId,
          accessToken: args.accessToken,
        })
      case 'update':
        if (!args.metaCaId || !args.patch) throw new Error('update requires metaCaId + patch')
        return await caClient.updateMetaCustomAudience({
          metaCaId: args.metaCaId,
          accessToken: args.accessToken,
          patch: args.patch,
        })
      case 'delete':
        if (!args.metaCaId) throw new Error('delete requires metaCaId')
        await caClient.deleteMetaCustomAudience({
          metaCaId: args.metaCaId,
          accessToken: args.accessToken,
        })
        return { success: true }
      case 'upload-users':
        if (!args.metaCaId || !args.uploadPayload)
          throw new Error('upload-users requires metaCaId + uploadPayload')
        return await caClient.uploadCustomerListUsers({
          metaCaId: args.metaCaId,
          accessToken: args.accessToken,
          schema: args.uploadPayload.schema,
          hashedRows: args.uploadPayload.hashedRows,
        })
    }
  },

  // Phase 4 — Saved Audiences
  async savedAudienceCRUD(args: {
    op: 'create' | 'get' | 'list' | 'update' | 'delete'
    accessToken: string
    adAccountId?: string
    metaSavId?: string
    sa?: AdSavedAudience
    patch?: { name?: string; description?: string; targeting?: AdTargeting }
  }) {
    switch (args.op) {
      case 'create':
        if (!args.adAccountId || !args.sa) throw new Error('create requires adAccountId + sa')
        return await saClient.createMetaSavedAudience({
          adAccountId: args.adAccountId,
          accessToken: args.accessToken,
          sa: args.sa,
        })
      case 'list':
        if (!args.adAccountId) throw new Error('list requires adAccountId')
        return await saClient.listMetaSavedAudiences({
          adAccountId: args.adAccountId,
          accessToken: args.accessToken,
        })
      case 'get':
        if (!args.metaSavId) throw new Error('get requires metaSavId')
        return await saClient.getMetaSavedAudience({
          metaSavId: args.metaSavId,
          accessToken: args.accessToken,
        })
      case 'update':
        if (!args.metaSavId || !args.patch) throw new Error('update requires metaSavId + patch')
        return await saClient.updateMetaSavedAudience({
          metaSavId: args.metaSavId,
          accessToken: args.accessToken,
          patch: args.patch,
        })
      case 'delete':
        if (!args.metaSavId) throw new Error('delete requires metaSavId')
        await saClient.deleteMetaSavedAudience({
          metaSavId: args.metaSavId,
          accessToken: args.accessToken,
        })
        return { success: true }
    }
  },
}
