// lib/ads/providers/google/display-targeting.ts
//
// Display ad-group targeting criteria CRUD: audience, topic, placement.
// All mutations route to customers/{cid}/adGroupCriteria:mutate.
// Generic criterion removal is re-exported from keywords.ts (same endpoint, same logic).

import { GOOGLE_ADS_API_BASE_URL } from './constants'
export { removeCriterion } from './keywords'

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
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/adGroupCriteria:mutate`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads adGroupCriteria mutate failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string {
  return rn.split('/').pop() ?? ''
}

/**
 * Add an audience targeting criterion to a Display ad group.
 *
 * audienceResourceName must be one of:
 *   - 'customers/{cid}/userLists/{id}'      → remarketing / customer match
 *   - 'customers/{cid}/userInterests/{id}'  → affinity / in-market audiences
 */
export async function addAudienceCriterion(args: CallArgs & {
  adGroupResourceName: string
  audienceResourceName: string
}): Promise<GoogleMutateResult> {
  const isUserList = args.audienceResourceName.includes('/userLists/')
  const isUserInterest = args.audienceResourceName.includes('/userInterests/')

  let create: Record<string, unknown>
  if (isUserList) {
    create = {
      adGroup: args.adGroupResourceName,
      userList: { userList: args.audienceResourceName },
    }
  } else if (isUserInterest) {
    create = {
      adGroup: args.adGroupResourceName,
      userInterest: { userInterestCategory: args.audienceResourceName },
    }
  } else {
    throw new Error(`Unrecognized audience resource name: ${args.audienceResourceName}`)
  }

  const body = { operations: [{ create }] }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Audience criterion creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/**
 * Add a topic targeting criterion using Google's predefined topic taxonomy.
 * topicResourceName is in the form 'topicConstants/{id}', e.g. 'topicConstants/603' for Sports.
 */
export async function addTopicCriterion(args: CallArgs & {
  adGroupResourceName: string
  topicResourceName: string  // 'topicConstants/{id}'
}): Promise<GoogleMutateResult> {
  const body = {
    operations: [
      {
        create: {
          adGroup: args.adGroupResourceName,
          topic: { topicConstant: args.topicResourceName },
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Topic criterion creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/**
 * Add a placement targeting criterion (specific URL or app where the ad should show).
 * placementUrl is a plain URL such as 'example.com/sports'.
 */
export async function addPlacementCriterion(args: CallArgs & {
  adGroupResourceName: string
  placementUrl: string  // e.g. 'example.com/sports'
}): Promise<GoogleMutateResult> {
  if (!args.placementUrl.trim()) throw new Error('placementUrl cannot be empty')
  const body = {
    operations: [
      {
        create: {
          adGroup: args.adGroupResourceName,
          placement: { url: args.placementUrl.trim() },
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Placement criterion creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}
