import type { AdKeywordMatchType } from '@/lib/ads/types'
import { GOOGLE_ADS_API_BASE_URL } from './constants'
import { googleKeywordMatchType, microsFromMajor } from './mappers'

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

/** Add a positive keyword on an Ad Group. */
export async function addKeyword(args: CallArgs & {
  adGroupResourceName: string  // 'customers/{cid}/adGroups/{id}'
  text: string
  matchType: AdKeywordMatchType
  cpcBidMajor?: number  // optional per-keyword bid override
}): Promise<GoogleMutateResult> {
  if (!args.text.trim()) throw new Error('Keyword text cannot be empty')

  const create: Record<string, unknown> = {
    adGroup: args.adGroupResourceName,
    status: 'ENABLED',
    keyword: {
      text: args.text.trim(),
      matchType: googleKeywordMatchType(args.matchType),
    },
  }
  if (args.cpcBidMajor !== undefined) {
    create.cpcBidMicros = microsFromMajor(args.cpcBidMajor)
  }

  const body = { operations: [{ create }] }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({
    ...args,
    resource: 'adGroupCriteria',
    body,
  })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Keyword creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/** Add an Ad-Group-level negative keyword (suppresses for one Ad Group only). */
export async function addAdGroupNegativeKeyword(args: CallArgs & {
  adGroupResourceName: string
  text: string
  matchType: AdKeywordMatchType
}): Promise<GoogleMutateResult> {
  if (!args.text.trim()) throw new Error('Keyword text cannot be empty')

  const body = {
    operations: [
      {
        create: {
          adGroup: args.adGroupResourceName,
          negative: true,
          keyword: {
            text: args.text.trim(),
            matchType: googleKeywordMatchType(args.matchType),
          },
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({
    ...args,
    resource: 'adGroupCriteria',
    body,
  })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Negative keyword creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/** Add a Campaign-level negative keyword (suppresses across all Ad Groups in the campaign). */
export async function addCampaignNegativeKeyword(args: CallArgs & {
  campaignResourceName: string
  text: string
  matchType: AdKeywordMatchType
}): Promise<GoogleMutateResult> {
  if (!args.text.trim()) throw new Error('Keyword text cannot be empty')

  const body = {
    operations: [
      {
        create: {
          campaign: args.campaignResourceName,
          negative: true,
          keyword: {
            text: args.text.trim(),
            matchType: googleKeywordMatchType(args.matchType),
          },
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({
    ...args,
    resource: 'campaignCriteria',
    body,
  })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Campaign negative keyword creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/** Remove any criterion (positive keyword, ad-group negative, or campaign negative). */
export async function removeCriterion(args: CallArgs & {
  resourceName: string  // 'customers/.../adGroupCriteria/...~...' or 'customers/.../campaignCriteria/...~...'
}): Promise<GoogleMutateResult> {
  const isCampaignCriterion = args.resourceName.includes('/campaignCriteria/')
  const resource = isCampaignCriterion ? 'campaignCriteria' : 'adGroupCriteria'
  const body = { operations: [{ remove: args.resourceName }] }
  await googleMutate({ ...args, resource, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
