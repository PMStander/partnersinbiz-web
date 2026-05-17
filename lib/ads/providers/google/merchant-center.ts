const MC_API_BASE = 'https://shoppingcontent.googleapis.com/content/v2.1'
export const MC_SCOPE = 'https://www.googleapis.com/auth/content'

function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

/** Build the Google OAuth authorize URL for Merchant Center (content scope). */
export function buildMcAuthorizeUrl(args: {
  redirectUri: string
  state: string
}): string {
  const clientId = requireEnv('GOOGLE_OAUTH_CLIENT_ID')
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', args.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', MC_SCOPE)
  u.searchParams.set('state', args.state)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  return u.toString()
}

/** Exchange OAuth code for tokens. Mirrors Google Ads exchange but with content scope. */
export async function exchangeMcCode(args: {
  code: string
  redirectUri: string
}): Promise<{
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
}> {
  const clientId = requireEnv('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = requireEnv('GOOGLE_OAUTH_CLIENT_SECRET')

  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MC token exchange failed: HTTP ${res.status} — ${text}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
  }
}

export interface MerchantAccountSummary {
  merchantId: string
  name?: string
}

/** Lists Merchant Center accounts the authenticated user has access to. */
export async function listMerchantAccounts(args: {
  accessToken: string
}): Promise<MerchantAccountSummary[]> {
  // The MC API lists sub-accounts of a primary MMC account.
  // For MVP, hit /accounts/authinfo to get the IDs the user can access.
  const url = `${MC_API_BASE}/accounts/authinfo`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Merchant Center accounts/authinfo failed: HTTP ${res.status} — ${text}`)
  }
  const data = (await res.json()) as {
    accountIdentifiers?: Array<{ merchantId?: string; aggregatorId?: string }>
  }
  const ids = (data.accountIdentifiers ?? [])
    .map((a) => a.merchantId ?? a.aggregatorId)
    .filter((id): id is string => !!id)
  return ids.map((merchantId) => ({ merchantId }))
}

export interface MerchantDatafeed {
  id: string
  name?: string
  targetCountry?: string
  feedLabel?: string
}

/** Lists datafeeds for a specific Merchant account; returns feed labels for binding. */
export async function listDatafeeds(args: {
  accessToken: string
  merchantId: string
}): Promise<MerchantDatafeed[]> {
  const url = `${MC_API_BASE}/${args.merchantId}/datafeeds`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Merchant Center datafeeds failed: HTTP ${res.status} — ${text}`)
  }
  const data = (await res.json()) as {
    resources?: Array<{
      id?: string
      name?: string
      targets?: Array<{ country?: string; feedLabel?: string }>
    }>
  }
  return (data.resources ?? []).map((d) => ({
    id: d.id ?? '',
    name: d.name,
    targetCountry: d.targets?.[0]?.country,
    feedLabel: d.targets?.[0]?.feedLabel ?? d.targets?.[0]?.country,
  }))
}

/** Extract unique feed labels from a datafeed list. */
export function extractFeedLabels(feeds: MerchantDatafeed[]): string[] {
  const labels = new Set<string>()
  for (const f of feeds) {
    if (f.feedLabel) labels.add(f.feedLabel)
  }
  return Array.from(labels).sort()
}
