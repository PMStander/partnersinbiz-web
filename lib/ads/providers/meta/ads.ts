// lib/ads/providers/meta/ads.ts
// Meta Marketing API v25.0 ad endpoints
import { META_GRAPH_BASE } from './constants'
import { adToMetaCreativeSpec, canonicalStatus } from './mappers'
import { uploadImageFromUrl } from './image-upload'
import type { Ad } from '@/lib/ads/types'

export interface MetaAdRaw {
  id: string
  name: string
  adset_id: string
  campaign_id?: string
  status: string
  creative?: { id?: string }
  created_time?: string
  updated_time?: string
}

function stripActPrefix(id: string): string {
  return id.startsWith('act_') ? id : `act_${id}`
}

function metaError(body: unknown, status: number): Error {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: { message?: string } }).error
    return new Error(`Meta API error: ${err.message ?? `HTTP ${status}`}`)
  }
  return new Error(`Meta API error: HTTP ${status}`)
}

const AD_FIELDS = [
  'id', 'name', 'adset_id', 'campaign_id', 'status',
  'creative{id}', 'created_time', 'updated_time',
].join(',')

export async function createAd(args: {
  adAccountId: string
  accessToken: string
  ad: Ad
  metaAdSetId: string
  pageId: string
  preResolvedImageHashes?: string[]  // ← Phase 3 — skip inline upload when provided
}): Promise<{ metaAdId: string; metaCreativeId: string }> {
  const accountId = stripActPrefix(args.adAccountId)

  // Resolve image hash(es). Phase 3: pre-resolved (from canonical creatives library).
  // Phase 2 fallback: upload inline URLs.
  let imageHashOrHashes: string | string[]
  if (args.preResolvedImageHashes && args.preResolvedImageHashes.length > 0) {
    imageHashOrHashes = args.ad.format === 'CAROUSEL' ? args.preResolvedImageHashes : args.preResolvedImageHashes[0]
  } else if (args.ad.format === 'CAROUSEL' && args.ad.inlineCarouselUrls?.length) {
    imageHashOrHashes = await Promise.all(
      args.ad.inlineCarouselUrls.map((sourceUrl) =>
        uploadImageFromUrl({ adAccountId: accountId, accessToken: args.accessToken, sourceUrl }),
      ),
    )
  } else if (args.ad.inlineImageUrl) {
    imageHashOrHashes = await uploadImageFromUrl({
      adAccountId: accountId,
      accessToken: args.accessToken,
      sourceUrl: args.ad.inlineImageUrl,
    })
  } else {
    throw new Error('Ad has no creativeIds and no inlineImageUrl — cannot create')
  }

  // Step 2: build creative spec + POST /adcreatives
  const creativeSpec = adToMetaCreativeSpec(args.ad, args.pageId, imageHashOrHashes)
  const creativeUrl = `${META_GRAPH_BASE}/${accountId}/adcreatives`
  const creativeForm = new URLSearchParams({
    name: creativeSpec.name,
    object_story_spec: JSON.stringify(creativeSpec.object_story_spec),
    access_token: args.accessToken,
  })
  const creativeRes = await fetch(creativeUrl, { method: 'POST', body: creativeForm })
  const creativeBody = await creativeRes.json()
  if (!creativeRes.ok || (creativeBody && typeof creativeBody === 'object' && 'error' in creativeBody)) {
    throw metaError(creativeBody, creativeRes.status)
  }
  const metaCreativeId = (creativeBody as { id: string }).id

  // Step 3: POST /ads referencing the new creative
  const adUrl = `${META_GRAPH_BASE}/${accountId}/ads`
  const adForm = new URLSearchParams({
    name: args.ad.name,
    adset_id: args.metaAdSetId,
    creative: JSON.stringify({ creative_id: metaCreativeId }),
    status: canonicalStatus(args.ad.status),
    access_token: args.accessToken,
  })
  const adRes = await fetch(adUrl, { method: 'POST', body: adForm })
  const adBody = await adRes.json()
  if (!adRes.ok || (adBody && typeof adBody === 'object' && 'error' in adBody)) {
    throw metaError(adBody, adRes.status)
  }
  const metaAdId = (adBody as { id: string }).id

  return { metaAdId, metaCreativeId }
}

export async function listAds(args: {
  adAccountId?: string
  adSetId?: string
  accessToken: string
  after?: string
  limit?: number
}): Promise<{ data: MetaAdRaw[]; nextAfter?: string }> {
  // If adSetId provided, list by adset; else list by ad account
  const base = args.adSetId
    ? `${META_GRAPH_BASE}/${args.adSetId}/ads`
    : `${META_GRAPH_BASE}/${stripActPrefix(args.adAccountId!)}/ads`

  const url = new URL(base)
  url.searchParams.set('fields', AD_FIELDS)
  url.searchParams.set('limit', String(args.limit ?? 25))
  url.searchParams.set('access_token', args.accessToken)
  if (args.after) url.searchParams.set('after', args.after)

  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  const data = (body as { data: MetaAdRaw[]; paging?: { cursors?: { after?: string } } }).data ?? []
  const nextAfter = (body as { paging?: { cursors?: { after?: string } } }).paging?.cursors?.after
  return { data, nextAfter }
}

export async function getAd(args: {
  metaAdId: string
  accessToken: string
}): Promise<MetaAdRaw> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaAdId}`)
  url.searchParams.set('fields', AD_FIELDS)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return body as MetaAdRaw
}

/**
 * Update a live ad's simple mutable fields: name and status.
 *
 * Phase 2 limitation: creative changes (copy, images, format) cannot be patched
 * on a live ad. Meta requires a new creative + new ad for those. Use createAd
 * with the updated content and archive the old ad.
 */
export async function updateAd(args: {
  metaAdId: string
  accessToken: string
  patch: Partial<Ad>
  validateOnly?: boolean
}): Promise<{ success: boolean }> {
  const url = `${META_GRAPH_BASE}/${args.metaAdId}`
  const form: Record<string, string> = {}
  if (args.patch.name) form.name = args.patch.name
  if (args.patch.status) form.status = canonicalStatus(args.patch.status)
  if (args.validateOnly) form.execution_options = JSON.stringify(['VALIDATE'])
  form.access_token = args.accessToken
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(form) })
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    throw metaError(body, res.status)
  }
  return { success: true }
}

export async function deleteAd(args: {
  metaAdId: string
  accessToken: string
}): Promise<void> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaAdId}`)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString(), { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw metaError(body, res.status)
  }
}

export async function validateAd(args: {
  metaAdId: string
  accessToken: string
  patch: Partial<Ad>
}): Promise<{ success: boolean }> {
  return updateAd({ ...args, validateOnly: true })
}
