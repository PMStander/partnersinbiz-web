/**
 * POST /api/v1/social/posts/:id/publish  — publish a post immediately
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getDefaultProvider, getProvider } from '@/lib/social/providers'
import type { SocialPlatformType } from '@/lib/social/providers'
import type { ProviderCredentials } from '@/lib/social/providers/base'
import { decryptTokenBlock } from '@/lib/social/encryption'
import { logAudit } from '@/lib/social/audit'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Resolve a platform string to SocialPlatformType. Handles legacy alias 'x' → 'twitter'. */
function toPlatformType(platform: string): SocialPlatformType | null {
  if (platform === 'x') return 'twitter'
  const SUPPORTED: SocialPlatformType[] = [
    'twitter', 'linkedin', 'facebook', 'instagram', 'reddit',
    'tiktok', 'pinterest', 'bluesky', 'threads', 'youtube', 'mastodon', 'dribbble',
  ]
  return SUPPORTED.includes(platform as SocialPlatformType)
    ? (platform as SocialPlatformType)
    : null
}

export const POST = withAuth('admin', withTenant(async (_req, user, orgId, context) => {
  const { id } = await (context as Params).params

  const doc = await adminDb.collection('social_posts').doc(id).get()
  if (!doc.exists) return apiError('Post not found', 404)

  const post = doc.data()!
  if (post.orgId && post.orgId !== orgId) return apiError('Post not found', 404)

  if (post.status === 'published') return apiError('Post already published', 409)
  if (post.status === 'cancelled') return apiError('Cannot publish a cancelled post', 400)

  const platformType = toPlatformType(post.platform)
  if (!platformType) return apiError(`Unsupported platform: ${post.platform}`, 400)

  const text = typeof post.content === 'string' ? post.content : post.content?.text
  if (!text) return apiError('Post has no content', 400)

  let externalId: string

  try {
    // Resolve provider: prefer per-account credentials from Firestore, fall back to env vars
    const accountIds: string[] | undefined = post.accountIds
    const accountId = Array.isArray(accountIds) && accountIds.length > 0 ? accountIds[0] : null

    let provider
    if (accountId) {
      const accountDoc = await adminDb.collection('social_accounts').doc(accountId).get()
      if (accountDoc.exists && accountDoc.data()?.orgId === orgId) {
        const account = accountDoc.data()!
        const { accessToken, refreshToken } = decryptTokenBlock(account.encryptedTokens, orgId)

        // Build credentials based on account type
        const credentials: ProviderCredentials = {
          accessToken,
          refreshToken: refreshToken ?? undefined,
          // LinkedIn: use the stored personUrn (could be org URN or personal URN)
          personUrn: account.platformAccountId ?? undefined,
          // Mastodon: instance URL
          instanceUrl: (account.platformMeta?.instanceUrl as string | undefined) ?? undefined,
        }

        // For Twitter OAuth 1.0a legacy accounts (env-based), add API keys
        // OAuth 2.0 accounts only need the Bearer accessToken
        if (platformType === 'twitter' && account.accountType !== 'personal') {
          // Legacy env-based: needs OAuth 1.0a signing keys
          credentials.apiKey = process.env.X_API_KEY
          credentials.apiKeySecret = process.env.X_API_KEY_SECRET
          credentials.accessTokenSecret = refreshToken ?? undefined
        }

        provider = getProvider(platformType, credentials)
      } else {
        provider = getDefaultProvider(platformType)
      }
    } else {
      provider = getDefaultProvider(platformType)
    }

    const threadParts: string[] | undefined = post.threadParts

    if (Array.isArray(threadParts) && threadParts.length > 0) {
      const results = await provider.publishThread(threadParts)
      externalId = results[0].platformPostId
    } else {
      const result = await provider.publishPost({ text })
      externalId = result.platformPostId
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await adminDb.collection('social_posts').doc(id).update({
      status: 'failed',
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
    })

    await logAudit({
      orgId,
      action: 'post.failed',
      entityType: 'post',
      entityId: id,
      performedBy: 'system',
      performedByRole: 'system',
      details: { error: message, platform: post.platform },
    })

    return apiError('Publish failed: ' + message, 500)
  }

  await adminDb.collection('social_posts').doc(id).update({
    status: 'published',
    publishedAt: FieldValue.serverTimestamp(),
    externalId,
    error: null,
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Complete queue entry if exists
  const queueDoc = await adminDb.collection('social_queue').doc(id).get()
  if (queueDoc.exists) {
    await adminDb.collection('social_queue').doc(id).update({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    })
  }

  await logAudit({
    orgId,
    action: 'post.published',
    entityType: 'post',
    entityId: id,
    performedBy: user.uid,
    performedByRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    details: { externalId, platform: post.platform },
  })

  return apiSuccess({ id, externalId, platform: post.platform })
}))
