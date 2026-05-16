// lib/ads/providers/meta/oauth.ts
import { META_ADS_SCOPES, META_GRAPH_BASE, META_OAUTH_DIALOG_URL } from './constants'

function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

export function buildAuthorizeUrl(args: {
  redirectUri: string
  state: string
  orgId: string
}): string {
  const clientId = requireEnv('FACEBOOK_CLIENT_ID')
  const u = new URL(META_OAUTH_DIALOG_URL)
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', args.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', META_ADS_SCOPES.join(','))
  u.searchParams.set('state', args.state)
  return u.toString()
}

export async function exchangeCode(args: {
  code: string
  redirectUri: string
}): Promise<{ accessToken: string; expiresInSeconds: number; userId?: string }> {
  const clientId = requireEnv('FACEBOOK_CLIENT_ID')
  const clientSecret = requireEnv('FACEBOOK_CLIENT_SECRET')

  const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('code', args.code)

  const res = await fetch(url.toString())
  const body = (await res.json()) as
    | { access_token: string; expires_in: number }
    | { error: { message: string; type?: string; code?: number } }

  if (!res.ok || 'error' in body) {
    const msg = 'error' in body ? body.error.message : `HTTP ${res.status}`
    throw new Error(`Meta token exchange failed: ${msg}`)
  }

  let userId: string | undefined
  try {
    const meRes = await fetch(`${META_GRAPH_BASE}/me?access_token=${body.access_token}`)
    if (meRes.ok) {
      const me = (await meRes.json()) as { id?: string }
      userId = me.id
    }
  } catch {
    // ignore — userId is best-effort
  }

  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in,
    userId,
  }
}

export async function exchangeForLongLived(args: {
  accessToken: string
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const clientId = requireEnv('FACEBOOK_CLIENT_ID')
  const clientSecret = requireEnv('FACEBOOK_CLIENT_SECRET')

  const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)
  url.searchParams.set('fb_exchange_token', args.accessToken)

  const res = await fetch(url.toString())
  const body = (await res.json()) as
    | { access_token: string; expires_in: number }
    | { error: { message: string } }

  if (!res.ok || 'error' in body) {
    const msg = 'error' in body ? body.error.message : `HTTP ${res.status}`
    throw new Error(`Meta long-lived exchange failed: ${msg}`)
  }

  return { accessToken: body.access_token, expiresInSeconds: body.expires_in }
}

/**
 * Meta has no traditional refresh-token flow — instead, exchange the still-valid
 * long-lived token for a fresh ~60-day one before expiry. We accept "refreshToken"
 * to satisfy the AdProvider interface; callers pass the current access token.
 */
export async function refresh(args: { refreshToken: string }): Promise<{
  accessToken: string
  expiresInSeconds: number
  refreshToken?: string
}> {
  const swap = await exchangeForLongLived({ accessToken: args.refreshToken })
  return { accessToken: swap.accessToken, expiresInSeconds: swap.expiresInSeconds }
}
