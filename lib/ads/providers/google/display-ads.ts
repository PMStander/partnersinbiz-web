// lib/ads/providers/google/display-ads.ts
// Responsive Display Ad (RDA) CRUD helper — Sub-3a Phase 3 Batch 2 Agent B.
// Targets: customers/{cid}/adGroupAds:mutate

import type { Ad, AdEntityStatus } from '@/lib/ads/types'
import { GOOGLE_ADS_API_BASE_URL } from './constants'
import { googleEntityStatusFromCanonical } from './mappers'
import { type RdaAssets, validateRdaAssets } from './display-types'

interface CallArgs {
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}

interface GoogleMutateResult {
  resourceName: string
  id: string
}

function buildHeaders(args: CallArgs): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${args.accessToken}`,
    'developer-token': args.developerToken,
    'Content-Type': 'application/json',
  }
  if (args.loginCustomerId) h['login-customer-id'] = args.loginCustomerId
  return h
}

async function googleMutate<T>(args: CallArgs & { body: unknown }): Promise<T> {
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/adGroupAds:mutate`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads adGroupAds mutate failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string {
  return rn.split('/').pop() ?? ''
}

/** Create a Responsive Display Ad within a Display Ad Group. */
export async function createResponsiveDisplayAd(args: CallArgs & {
  adGroupResourceName: string
  canonical: Ad
  rdaAssets: RdaAssets
}): Promise<GoogleMutateResult> {
  validateRdaAssets(args.rdaAssets)

  // Build the Google responsiveDisplayAd payload. Images are passed as
  // {asset: 'customers/{cid}/assets/{id}'} OR — for MVP — as plain URLs
  // wrapped in {asset: url}. Asset upload pipeline is deferred to Sub-3a-extension.
  const responsiveDisplayAd: Record<string, unknown> = {
    marketingImages: args.rdaAssets.marketingImages.map((url) => ({ asset: url })),
    squareMarketingImages: args.rdaAssets.squareMarketingImages.map((url) => ({ asset: url })),
    headlines: args.rdaAssets.headlines.map((text) => ({ text })),
    longHeadlines: args.rdaAssets.longHeadlines.map((text) => ({ text })),
    descriptions: args.rdaAssets.descriptions.map((text) => ({ text })),
    businessName: args.rdaAssets.businessName,
  }

  if (args.rdaAssets.logoImages && args.rdaAssets.logoImages.length > 0) {
    responsiveDisplayAd.logoImages = args.rdaAssets.logoImages.map((url) => ({ asset: url }))
  }
  if (args.rdaAssets.squareLogoImages && args.rdaAssets.squareLogoImages.length > 0) {
    responsiveDisplayAd.squareLogoImages = args.rdaAssets.squareLogoImages.map((url) => ({ asset: url }))
  }
  if (args.rdaAssets.callToActionText) {
    responsiveDisplayAd.callToActionText = args.rdaAssets.callToActionText
  }

  const body = {
    operations: [
      {
        create: {
          adGroup: args.adGroupResourceName,
          status: googleEntityStatusFromCanonical(args.canonical.status),
          ad: {
            finalUrls: args.rdaAssets.finalUrls,
            responsiveDisplayAd,
          },
        },
      },
    ],
  }

  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('AdGroupAd creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/**
 * Update status of an existing AdGroupAd.
 * Asset edits are not supported via update — must remove + recreate per Google API rules.
 */
export async function updateAdGroupAd(args: CallArgs & {
  resourceName: string
  status?: AdEntityStatus
}): Promise<GoogleMutateResult> {
  const updateMask: string[] = []
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  if (args.status !== undefined) {
    update.status = googleEntityStatusFromCanonical(args.status)
    updateMask.push('status')
  }
  if (updateMask.length === 0) {
    return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
  }
  const body = { operations: [{ update, updateMask: updateMask.join(',') }] }
  await googleMutate({ ...args, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}

export async function removeAdGroupAd(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = { operations: [{ remove: args.resourceName }] }
  await googleMutate({ ...args, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
