import type { AdSet, AdEntityStatus } from '@/lib/ads/types'
import { GOOGLE_ADS_API_BASE_URL } from './constants'
import { googleEntityStatusFromCanonical, microsFromMajor } from './mappers'
import type { GoogleAdGroupType } from './mappers'

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
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/adGroups:mutate`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(args.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads adGroups mutate failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

function extractIdFromResourceName(rn: string): string {
  return rn.split('/').pop() ?? ''
}

/** Create an Ad Group within a campaign. */
export async function createAdGroup(args: CallArgs & {
  campaignResourceName: string  // 'customers/{cid}/campaigns/{cid}'
  canonical: AdSet
  defaultCpcBidMajor?: number  // default CPC bid in dollars
  type?: GoogleAdGroupType     // defaults to 'SEARCH_STANDARD'
}): Promise<GoogleMutateResult> {
  const cpcBidMicros = args.defaultCpcBidMajor !== undefined
    ? microsFromMajor(args.defaultCpcBidMajor)
    : microsFromMajor(0.50)  // default $0.50 CPC

  const body = {
    operations: [
      {
        create: {
          name: args.canonical.name,
          campaign: args.campaignResourceName,
          status: googleEntityStatusFromCanonical(args.canonical.status),
          type: args.type ?? 'SEARCH_STANDARD',
          cpcBidMicros,
        },
      },
    ],
  }
  const res = await googleMutate<{ results: Array<{ resourceName: string }> }>({ ...args, body })
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error('Ad Group creation returned no resourceName')
  return { resourceName, id: extractIdFromResourceName(resourceName) }
}

/** Update Ad Group — name, status, cpcBidMicros. */
export async function updateAdGroup(args: CallArgs & {
  resourceName: string
  name?: string
  status?: AdEntityStatus
  cpcBidMajor?: number
}): Promise<GoogleMutateResult> {
  const updateMask: string[] = []
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  if (args.name !== undefined) { update.name = args.name; updateMask.push('name') }
  if (args.status !== undefined) {
    update.status = googleEntityStatusFromCanonical(args.status)
    updateMask.push('status')
  }
  if (args.cpcBidMajor !== undefined) {
    update.cpcBidMicros = microsFromMajor(args.cpcBidMajor)
    updateMask.push('cpcBidMicros')
  }
  if (updateMask.length === 0) {
    return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
  }
  const body = { operations: [{ update, updateMask: updateMask.join(',') }] }
  await googleMutate({ ...args, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}

/** Remove Ad Group (status → REMOVED) */
export async function removeAdGroup(args: CallArgs & { resourceName: string }): Promise<GoogleMutateResult> {
  const body = { operations: [{ remove: args.resourceName }] }
  await googleMutate({ ...args, body })
  return { resourceName: args.resourceName, id: extractIdFromResourceName(args.resourceName) }
}
