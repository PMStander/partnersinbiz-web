import { GOOGLE_ADS_API_BASE_URL } from '../constants'

interface CallArgs {
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
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

async function gaqlSearch<T>(args: CallArgs & { query: string }): Promise<T> {
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/googleAds:search`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify({ query: args.query }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads GAQL search failed: HTTP ${res.status} — ${text}`)
  }
  return (await res.json()) as T
}

export interface PredefinedAudienceSummary {
  resourceName: string
  name: string
  description?: string
}

interface GoogleSearchResponse {
  results?: Array<{
    audience?: {
      resourceName?: string
      name?: string
      description?: string
    }
    userInterest?: {
      resourceName?: string
      name?: string
      userInterestParent?: string
    }
  }>
}

/** List Affinity audiences via GAQL. */
export async function listAffinityAudiences(args: CallArgs): Promise<PredefinedAudienceSummary[]> {
  const query = `
    SELECT user_interest.resource_name, user_interest.name, user_interest.user_interest_parent
    FROM user_interest
    WHERE user_interest.taxonomy_type = 'AFFINITY'
  `.trim()
  const res = await gaqlSearch<GoogleSearchResponse>({ ...args, query })
  return (res.results ?? [])
    .map((r) => r.userInterest)
    .filter((u): u is NonNullable<typeof u> => !!u && !!u.resourceName && !!u.name)
    .map((u) => ({
      resourceName: u.resourceName!,
      name: u.name!,
    }))
}

/** List In-market audiences via GAQL. */
export async function listInMarketAudiences(args: CallArgs): Promise<PredefinedAudienceSummary[]> {
  const query = `
    SELECT user_interest.resource_name, user_interest.name, user_interest.user_interest_parent
    FROM user_interest
    WHERE user_interest.taxonomy_type = 'IN_MARKET'
  `.trim()
  const res = await gaqlSearch<GoogleSearchResponse>({ ...args, query })
  return (res.results ?? [])
    .map((r) => r.userInterest)
    .filter((u): u is NonNullable<typeof u> => !!u && !!u.resourceName && !!u.name)
    .map((u) => ({
      resourceName: u.resourceName!,
      name: u.name!,
    }))
}

/** List Detailed Demographics via GAQL. */
export async function listDetailedDemographics(args: CallArgs): Promise<PredefinedAudienceSummary[]> {
  const query = `
    SELECT user_interest.resource_name, user_interest.name
    FROM user_interest
    WHERE user_interest.taxonomy_type = 'PRODUCTS_AND_SERVICES'
  `.trim()
  // Note: Google's actual "Detailed Demographics" taxonomy maps internally — verify against your account if exact match is critical
  const res = await gaqlSearch<GoogleSearchResponse>({ ...args, query })
  return (res.results ?? [])
    .map((r) => r.userInterest)
    .filter((u): u is NonNullable<typeof u> => !!u && !!u.resourceName && !!u.name)
    .map((u) => ({
      resourceName: u.resourceName!,
      name: u.name!,
    }))
}
