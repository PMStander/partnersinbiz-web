// lib/ads/providers/google/campaigns-display.ts
// Google Ads Display campaign CRUD helper — Sub-3a Phase 3 Batch 2.
// Wraps `customers/{cid}/campaigns:mutate` and `customers/{cid}/campaignBudgets:mutate`.

import type { AdCampaign } from '@/lib/ads/types'
import { GOOGLE_ADS_API_BASE_URL } from './constants'
import {
  googleEntityStatusFromCanonical,
  googleDisplayNetworkSettings,
  defaultDisplayBiddingStrategy,
  microsFromMajor,
} from './mappers'

interface CallArgs {
  customerId: string  // 10-digit, no dashes
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}

interface GoogleMutateResult {
  resourceName: string
  id: string  // last segment of resourceName
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

async function googleMutate<T>(args: CallArgs & { resource: string; body: unknown }): Promise<T> {
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/${args.resource}:mutate`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads ${args.resource} mutate failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string {
  return rn.split('/').pop() ?? ''
}

/** Create a Display campaign. Returns Google resource name + id. */
export async function createDisplayCampaign(
  args: CallArgs & { canonical: AdCampaign; dailyBudgetMajor?: number },
): Promise<GoogleMutateResult> {
  // Step 1: Create a campaign budget (required before campaign creation)
  const budgetBody = {
    operations: [
      {
        create: {
          name: `${args.canonical.name} budget`,
          amountMicros: microsFromMajor(args.dailyBudgetMajor ?? 10),  // default $10/day
          deliveryMethod: 'STANDARD',
        },
      },
    ],
  }
  const budgetRes = await googleMutate<{ results: Array<{ resourceName: string }> }>({
    ...args,
    resource: 'campaignBudgets',
    body: budgetBody,
  })
  const budgetResourceName = budgetRes.results[0]?.resourceName
  if (!budgetResourceName) throw new Error('Budget creation returned no resourceName')

  // Step 2: Create the Display campaign
  const biddingStrategy = defaultDisplayBiddingStrategy()
  const campaignBody = {
    operations: [
      {
        create: {
          name: args.canonical.name,
          status: googleEntityStatusFromCanonical(args.canonical.status),
          advertisingChannelType: 'DISPLAY',
          campaignBudget: budgetResourceName,
          networkSettings: googleDisplayNetworkSettings(),
          ...biddingStrategy,  // spreads { maximizeConversions: {} }
        },
      },
    ],
  }
  const campaignRes = await googleMutate<{ results: Array<{ resourceName: string }> }>({
    ...args,
    resource: 'campaigns',
    body: campaignBody,
  })
  const resourceName = campaignRes.results[0]?.resourceName
  if (!resourceName) throw new Error('Campaign creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/** Update existing Display campaign — name, status only in MVP. */
export async function updateDisplayCampaign(
  args: CallArgs & { resourceName: string; name?: string; status?: AdCampaign['status'] },
): Promise<GoogleMutateResult> {
  const updateMask: string[] = []
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  if (args.name !== undefined) { update.name = args.name; updateMask.push('name') }
  if (args.status !== undefined) {
    update.status = googleEntityStatusFromCanonical(args.status)
    updateMask.push('status')
  }
  if (updateMask.length === 0) {
    return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
  }
  const body = {
    operations: [{ update, updateMask: updateMask.join(',') }],
  }
  await googleMutate({ ...args, resource: 'campaigns', body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}

/** Pause Display campaign (sets status to PAUSED) */
export async function pauseDisplayCampaign(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  return updateDisplayCampaign({ ...args, status: 'PAUSED' })
}

/** Resume Display campaign (sets status to ENABLED via canonical ACTIVE) */
export async function resumeDisplayCampaign(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  return updateDisplayCampaign({ ...args, status: 'ACTIVE' })
}

/** Remove Display campaign */
export async function removeDisplayCampaign(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = {
    operations: [{ remove: args.resourceName }],
  }
  await googleMutate({ ...args, resource: 'campaigns', body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
