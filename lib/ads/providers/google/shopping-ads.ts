// lib/ads/providers/google/shopping-ads.ts
// ProductAd (Shopping) CRUD helper — Sub-3a Phase 4 Batch 2 Agent C.
// Targets: customers/{cid}/adGroupAds:mutate
// ProductAd has no per-ad assets — all content is sourced from the Merchant Center product feed.

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

/** Create a ProductAd. ProductAd has no headlines/descriptions/assets — all from product feed. */
export async function createProductAd(args: CallArgs & {
  adGroupResourceName: string
  canonical: Ad
}): Promise<GoogleMutateResult> {
  const body = {
    operations: [
      {
        create: {
          adGroup: args.adGroupResourceName,
          status: googleEntityStatusFromCanonical(args.canonical.status),
          ad: {
            productAd: {}, // intentionally empty — Shopping ad content sourced from feed
          },
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('ProductAd creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/** Update status of an existing ProductAd. */
export async function updateProductAd(args: CallArgs & {
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

/** Remove a ProductAd. */
export async function removeProductAd(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = { operations: [{ remove: args.resourceName }] }
  await googleMutate({ ...args, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
