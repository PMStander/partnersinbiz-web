// app/api/v1/ads/google/merchant-center/oauth/callback/route.ts
//
// Google OAuth callback for Merchant Center. Exchanges the code for tokens,
// discovers the first accessible merchant account + feed labels, encrypts
// tokens, persists the binding, and redirects the admin to the MC page.
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'
import {
  exchangeMcCode,
  listMerchantAccounts,
  listDatafeeds,
  extractFeedLabels,
} from '@/lib/ads/providers/google/merchant-center'
import { createMerchantCenter } from '@/lib/ads/merchant-center/store'
import { encryptToken } from '@/lib/social/encryption'

const STATE_COLLECTION = 'ad_oauth_states'

function redirectTo(base: string, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, base), { status: 302 })
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    return redirectTo(appBase, `/admin/ads/merchant-center?status=error&message=${encodeURIComponent(errorParam)}`)
  }
  if (!code || !state) {
    return apiError('Missing code or state', 400)
  }

  // 1. Verify state
  const stateDoc = await adminDb.collection(STATE_COLLECTION).doc(state).get()
  if (!stateDoc.exists) {
    return redirectTo(appBase, '/admin/ads/merchant-center?status=error&message=invalid_state')
  }
  const sd = stateDoc.data() as {
    orgId: string
    orgSlug?: string
    platform: string
    redirectUri: string
    expiresAt: { toMillis: () => number }
  }
  if (sd.platform !== 'google_merchant_center' || sd.expiresAt.toMillis() < Date.now()) {
    return redirectTo(appBase, '/admin/ads/merchant-center?status=error&message=expired_or_mismatched_state')
  }

  // Consume state (single use)
  await adminDb.collection(STATE_COLLECTION).doc(state).delete()

  try {
    // 2. Exchange code for tokens
    const tokens = await exchangeMcCode({ code, redirectUri: sd.redirectUri })

    // 3. Discover first merchant account
    const accounts = await listMerchantAccounts({ accessToken: tokens.accessToken })
    if (accounts.length === 0) {
      const redirectBase = sd.orgSlug
        ? `/admin/org/${sd.orgSlug}/ads/merchant-center`
        : '/admin/ads/merchant-center'
      return redirectTo(appBase, `${redirectBase}?status=error&message=no_merchant_accounts`)
    }
    const firstMerchantId = accounts[0].merchantId

    // 4. Best-effort datafeed labels
    let feedLabels: string[] = []
    try {
      const feeds = await listDatafeeds({ accessToken: tokens.accessToken, merchantId: firstMerchantId })
      feedLabels = extractFeedLabels(feeds)
    } catch {
      // Non-fatal — empty feedLabels still saves the binding
    }

    // 5. Encrypt tokens — encryptToken(plaintext, orgId) → EncryptedData (synchronous)
    const encryptedAccess = encryptToken(tokens.accessToken, sd.orgId)
    const encryptedRefresh = encryptToken(tokens.refreshToken, sd.orgId)

    // 6. Persist the binding
    await createMerchantCenter({
      orgId: sd.orgId,
      merchantId: firstMerchantId,
      accessTokenRef: JSON.stringify(encryptedAccess),
      refreshTokenRef: JSON.stringify(encryptedRefresh),
      feedLabels,
    })

    // 7. Redirect to admin merchant-center page
    const redirectPath = sd.orgSlug
      ? `/admin/org/${sd.orgSlug}/ads/merchant-center`
      : '/admin/ads/merchant-center'
    return redirectTo(appBase, `${redirectPath}?status=connected`)
  } catch (err) {
    const message = encodeURIComponent((err as Error).message.slice(0, 200))
    const redirectPath = sd.orgSlug
      ? `/admin/org/${sd.orgSlug}/ads/merchant-center`
      : '/admin/ads/merchant-center'
    return redirectTo(appBase, `${redirectPath}?status=error&message=${message}`)
  }
}
