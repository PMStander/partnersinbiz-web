/**
 * GET  /api/v1/social/accounts  — list connected social accounts
 * POST /api/v1/social/accounts  — create/connect a social account
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { SocialPlatformType, AccountStatus } from '@/lib/social/providers'
import { ACTIVE_PLATFORMS } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: AccountStatus[] = ['active', 'token_expired', 'disconnected', 'rate_limited']

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId') ?? 'default'
  const platform = searchParams.get('platform') as SocialPlatformType | null
  const status = searchParams.get('status') as AccountStatus | null
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('social_accounts').where('orgId', '==', orgId)

  if (platform && ACTIVE_PLATFORMS.includes(platform)) {
    query = query.where('platform', '==', platform)
  }

  if (status && VALID_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }

  const snapshot = await query.get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allAccounts = snapshot.docs.map((doc: any) => {
    const data = doc.data()
    // Strip encrypted tokens from response
    const { encryptedTokens: _, ...safe } = data
    return { id: doc.id, ...safe }
  })

  // In-memory pagination
  const total = allAccounts.length
  const start = (page - 1) * limit
  const accounts = allAccounts.slice(start, start + limit)

  return apiSuccess(accounts, 200, { total, page, limit })
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const body = await req.json()

  // Validate required fields
  if (!body.platform || !ACTIVE_PLATFORMS.includes(body.platform)) {
    return apiError(`platform must be one of: ${ACTIVE_PLATFORMS.join(', ')}`)
  }
  if (!body.displayName || typeof body.displayName !== 'string') {
    return apiError('displayName is required')
  }

  const doc = {
    orgId: body.orgId ?? 'default',
    platform: body.platform,
    platformAccountId: body.platformAccountId ?? '',
    displayName: body.displayName,
    username: body.username ?? '',
    avatarUrl: body.avatarUrl ?? '',
    profileUrl: body.profileUrl ?? '',
    accountType: body.accountType ?? 'personal',
    status: 'active' as AccountStatus,
    scopes: body.scopes ?? [],
    encryptedTokens: body.encryptedTokens ?? {
      accessToken: '',
      refreshToken: null,
      tokenType: 'bearer',
      expiresAt: null,
      iv: '',
      tag: '',
    },
    platformMeta: body.platformMeta ?? {},
    connectedBy: user.uid,
    connectedAt: FieldValue.serverTimestamp(),
    lastTokenRefresh: null,
    lastUsed: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const docRef = await adminDb.collection('social_accounts').add(doc)

  return apiSuccess({ id: docRef.id }, 201)
})
