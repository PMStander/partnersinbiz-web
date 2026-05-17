// lib/ads/providers/google/ads.ts
// Responsive Search Ad (RSA) CRUD helper — Sub-3a Phase 2 Batch 2 Agent C.
// Targets: customers/{cid}/adGroupAds:mutate

import type { Ad, AdEntityStatus } from '@/lib/ads/types'
import { GOOGLE_ADS_API_BASE_URL } from './constants'
import { googleEntityStatusFromCanonical } from './mappers'

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

export interface RsaHeadline {
  text: string
  pinnedField?: 'HEADLINE_1' | 'HEADLINE_2' | 'HEADLINE_3'
}

export interface RsaDescription {
  text: string
  pinnedField?: 'DESCRIPTION_1' | 'DESCRIPTION_2'
}

export interface RsaAssets {
  headlines: RsaHeadline[]
  descriptions: RsaDescription[]
  path1?: string
  path2?: string
  finalUrls: string[]
}

function validateRsaAssets(assets: RsaAssets): void {
  if (assets.headlines.length < 3 || assets.headlines.length > 15) {
    throw new Error(`RSA requires 3-15 headlines, got ${assets.headlines.length}`)
  }
  if (assets.descriptions.length < 2 || assets.descriptions.length > 4) {
    throw new Error(`RSA requires 2-4 descriptions, got ${assets.descriptions.length}`)
  }
  for (const h of assets.headlines) {
    if (h.text.length === 0) throw new Error('Headline cannot be empty')
    if (h.text.length > 30) throw new Error(`Headline exceeds 30 chars: "${h.text}"`)
  }
  for (const d of assets.descriptions) {
    if (d.text.length === 0) throw new Error('Description cannot be empty')
    if (d.text.length > 90) throw new Error(`Description exceeds 90 chars: "${d.text}"`)
  }
  if (assets.finalUrls.length === 0) throw new Error('RSA requires at least one finalUrl')
  if (assets.path1 && assets.path1.length > 15) throw new Error('path1 exceeds 15 chars')
  if (assets.path2 && assets.path2.length > 15) throw new Error('path2 exceeds 15 chars')
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

/** Create a Responsive Search Ad within an Ad Group. */
export async function createResponsiveSearchAd(args: CallArgs & {
  adGroupResourceName: string
  canonical: Ad
  rsaAssets: RsaAssets
}): Promise<GoogleMutateResult> {
  validateRsaAssets(args.rsaAssets)

  const responsiveSearchAd: Record<string, unknown> = {
    headlines: args.rsaAssets.headlines.map((h) =>
      h.pinnedField ? { text: h.text, pinnedField: h.pinnedField } : { text: h.text },
    ),
    descriptions: args.rsaAssets.descriptions.map((d) =>
      d.pinnedField ? { text: d.text, pinnedField: d.pinnedField } : { text: d.text },
    ),
  }
  if (args.rsaAssets.path1) responsiveSearchAd.path1 = args.rsaAssets.path1
  if (args.rsaAssets.path2) responsiveSearchAd.path2 = args.rsaAssets.path2

  const body = {
    operations: [
      {
        create: {
          adGroup: args.adGroupResourceName,
          status: googleEntityStatusFromCanonical(args.canonical.status),
          ad: {
            finalUrls: args.rsaAssets.finalUrls,
            responsiveSearchAd,
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
