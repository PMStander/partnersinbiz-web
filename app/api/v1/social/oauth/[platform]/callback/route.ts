/**
 * OAuth Callback — Handles the OAuth redirect from social platforms.
 *
 * GET /api/v1/social/oauth/{platform}/callback
 * Query: ?code={auth_code}&state={state_token}
 *
 * Exchanges the auth code for tokens, encrypts and stores them,
 * fetches profile info, and creates/updates the social_accounts entry.
 */
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'
import { getOAuthConfig, getClientCredentials, getCallbackUrl } from '@/lib/social/oauth-config'
import { encryptTokenBlock } from '@/lib/social/encryption'
import { getProvider } from '@/lib/social/providers/registry'
import { logAudit } from '@/lib/social/audit'
import type { SocialPlatformType } from '@/lib/social/providers/types'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const platform = url.pathname.split('/').slice(-2)[0] as SocialPlatformType
  const code = url.searchParams.get('code')
  const stateToken = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // Default redirect on failure
  let redirectUrl = '/admin/social'

  try {
    // Handle platform-side errors
    if (error) {
      const errorDesc = url.searchParams.get('error_description') ?? error
      return NextResponse.redirect(new URL(`${redirectUrl}?status=error&message=${encodeURIComponent(errorDesc)}`, url.origin))
    }

    if (!code || !stateToken) {
      return NextResponse.redirect(new URL(`${redirectUrl}?status=error&message=Missing+code+or+state`, url.origin))
    }

    // Decode and verify state
    const stateData = JSON.parse(Buffer.from(stateToken, 'base64url').toString())
    const { orgId, nonce, redirectUrl: savedRedirect } = stateData
    redirectUrl = savedRedirect ?? redirectUrl

    // Verify state in Firestore
    const stateDoc = await adminDb.collection('social_oauth_states').doc(nonce).get()
    if (!stateDoc.exists) {
      return NextResponse.redirect(new URL(`${redirectUrl}?status=error&message=Invalid+or+expired+state`, url.origin))
    }

    const stateRecord = stateDoc.data()!
    if (stateRecord.platform !== platform || stateRecord.orgId !== orgId) {
      return NextResponse.redirect(new URL(`${redirectUrl}?status=error&message=State+mismatch`, url.origin))
    }

    // Check expiry
    const expiresAt = stateRecord.expiresAt?.toDate?.() ?? new Date(0)
    if (expiresAt < new Date()) {
      await adminDb.collection('social_oauth_states').doc(nonce).delete()
      return NextResponse.redirect(new URL(`${redirectUrl}?status=error&message=OAuth+state+expired`, url.origin))
    }

    // Delete state token (one-time use)
    await adminDb.collection('social_oauth_states').doc(nonce).delete()

    // Exchange code for tokens
    const config = getOAuthConfig(platform)
    const clientCreds = getClientCredentials(platform)
    if (!config || !clientCreds) {
      return NextResponse.redirect(new URL(`${redirectUrl}?status=error&message=Platform+not+configured`, url.origin))
    }

    const callbackUrl = getCallbackUrl(platform)
    const tokenResponse = await exchangeCode(config, clientCreds, code, callbackUrl)

    // Build provider credentials to fetch profile
    const providerCreds = {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken ?? undefined,
      apiKey: clientCreds.clientId,
      apiKeySecret: clientCreds.clientSecret,
    }

    // Fetch profile from platform
    let profile
    try {
      // For Facebook/Instagram, we need additional steps to get page tokens
      if (platform === 'facebook') {
        profile = await fetchFacebookPageProfile(tokenResponse.accessToken)
        providerCreds.accessToken = profile.pageAccessToken ?? tokenResponse.accessToken
      } else if (platform === 'instagram') {
        profile = await fetchInstagramProfile(tokenResponse.accessToken)
      } else {
        const provider = getProvider(platform, {
          ...providerCreds,
          personUrn: 'temp', // Will be set after profile fetch
        })
        profile = await provider.getProfile()
      }
    } catch {
      // Profile fetch failed — store account anyway with minimal info
      profile = {
        platformAccountId: 'unknown',
        displayName: platform,
        username: '',
        avatarUrl: '',
        profileUrl: '',
        accountType: 'personal' as const,
      }
    }

    // Encrypt tokens
    const encryptedTokens = encryptTokenBlock(
      {
        accessToken: providerCreds.accessToken,
        refreshToken: tokenResponse.refreshToken,
        tokenType: tokenResponse.tokenType,
        expiresAt: tokenResponse.expiresIn
          ? new Date(Date.now() + tokenResponse.expiresIn * 1000)
          : null,
      },
      orgId,
    )

    // Check if account already exists for this platform + platformAccountId
    const existingQuery = await adminDb
      .collection('clients')
      .doc(orgId)
      .collection('social_accounts')
      .where('platform', '==', platform)
      .where('platformAccountId', '==', profile.platformAccountId)
      .limit(1)
      .get()

    const now = Timestamp.now()
    const accountData = {
      orgId,
      platform,
      platformAccountId: profile.platformAccountId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      accountType: profile.accountType ?? 'personal',
      status: 'active',
      scopes: config.scopes,
      encryptedTokens: {
        accessToken: encryptedTokens.accessToken,
        refreshToken: encryptedTokens.refreshToken,
        tokenType: encryptedTokens.tokenType,
        expiresAt: encryptedTokens.expiresAt ? Timestamp.fromDate(encryptedTokens.expiresAt) : null,
        iv: encryptedTokens.iv,
        tag: encryptedTokens.tag,
      },
      platformMeta: profile.meta ?? {},
      lastTokenRefresh: now,
      updatedAt: now,
    }

    let accountId: string
    if (!existingQuery.empty) {
      // Update existing account
      accountId = existingQuery.docs[0].id
      await adminDb
        .collection('clients')
        .doc(orgId)
        .collection('social_accounts')
        .doc(accountId)
        .update(accountData)
    } else {
      // Create new account
      const docRef = await adminDb
        .collection('clients')
        .doc(orgId)
        .collection('social_accounts')
        .add({
          ...accountData,
          connectedBy: 'oauth',
          connectedAt: now,
          lastUsed: null,
          createdAt: now,
        })
      accountId = docRef.id
    }

    // Audit log
    logAudit({
      orgId,
      action: 'account.connected',
      entityType: 'account',
      entityId: accountId,
      performedBy: 'oauth',
      performedByRole: 'system',
      details: { platform, displayName: profile.displayName },
    })

    return NextResponse.redirect(
      new URL(`${redirectUrl}?status=success&platform=${platform}&account=${accountId}`, url.origin),
    )
  } catch (err) {
    console.error(`OAuth callback error for ${platform}:`, err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(
      new URL(`${redirectUrl}?status=error&message=${encodeURIComponent(message)}`, url.origin),
    )
  }
}

// --- Token Exchange ---

interface TokenResponse {
  accessToken: string
  refreshToken: string | null
  tokenType: string
  expiresIn: number | null
}

async function exchangeCode(
  config: ReturnType<typeof getOAuthConfig> & {},
  clientCreds: { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  if (config.useBasicAuth) {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientCreds.clientId}:${clientCreds.clientSecret}`).toString('base64')}`
  } else {
    body.set('client_id', clientCreds.clientId)
    body.set('client_secret', clientCreds.clientSecret)
  }

  // TikTok uses JSON body
  let response: Response
  if (config.platform === 'tiktok') {
    response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_key: clientCreds.clientId,
        client_secret: clientCreds.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })
  } else {
    response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    })
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed for ${config.platform}: ${response.status} ${text}`)
  }

  const data = await response.json()

  // Normalize response (different platforms use different field names)
  return {
    accessToken: data.access_token ?? data.accessToken,
    refreshToken: data.refresh_token ?? data.refreshToken ?? null,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in ?? data.expiresIn ?? null,
  }
}

// --- Platform-specific profile helpers ---

async function fetchFacebookPageProfile(userAccessToken: string) {
  // Get user's pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`,
  )
  if (!pagesRes.ok) throw new Error('Failed to fetch Facebook pages')
  const pagesData = await pagesRes.json()

  if (!pagesData.data?.length) {
    throw new Error('No Facebook pages found for this account')
  }

  // Use the first page
  const page = pagesData.data[0]
  return {
    platformAccountId: page.id,
    displayName: page.name,
    username: page.name,
    avatarUrl: '',
    profileUrl: `https://www.facebook.com/${page.id}`,
    accountType: 'page' as const,
    pageAccessToken: page.access_token,
    meta: { pageCategory: page.category },
  }
}

async function fetchInstagramProfile(userAccessToken: string) {
  // Get pages, then find Instagram business account
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account{id,username,name,profile_picture_url,followers_count}&access_token=${userAccessToken}`,
  )
  if (!pagesRes.ok) throw new Error('Failed to fetch Instagram account')
  const pagesData = await pagesRes.json()

  const page = pagesData.data?.find(
    (p: Record<string, unknown>) => p.instagram_business_account,
  )
  if (!page?.instagram_business_account) {
    throw new Error('No Instagram business account found. Ensure your account is a business or creator account connected to a Facebook page.')
  }

  const ig = page.instagram_business_account
  return {
    platformAccountId: ig.id,
    displayName: ig.name ?? ig.username,
    username: ig.username,
    avatarUrl: ig.profile_picture_url ?? '',
    profileUrl: `https://www.instagram.com/${ig.username}/`,
    accountType: 'business' as const,
    meta: { facebookPageId: page.id, followersCount: ig.followers_count },
  }
}
