import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const POST = withAuth('client', withTenant(async (req: NextRequest, user: any, orgId: string) => {
  const body = await req.json()
  const { nonce, selections } = body as {
    nonce: string
    selections: Array<{ index: number; isDefault: boolean }>
  }

  if (!nonce || !Array.isArray(selections) || selections.length === 0) {
    return apiError('nonce and selections are required', 400)
  }

  const defaultCount = selections.filter(s => s.isDefault).length
  if (defaultCount > 1) return apiError('Only one default allowed per platform', 400)

  const pendingDoc = await adminDb.collection('social_oauth_pending').doc(nonce).get()
  if (!pendingDoc.exists) return apiError('Pending selection not found or expired', 404)

  const pending = pendingDoc.data()!
  if (pending.orgId !== orgId) return apiError('Not found', 404)
  if (pending.expiresAt.toDate() < new Date()) return apiError('Pending selection expired', 410)

  const platform: string = pending.platform
  const options: any[] = pending.options

  const batch = adminDb.batch()

  const existingDefaults = await adminDb
    .collection('social_accounts')
    .where('orgId', '==', orgId)
    .where('platform', '==', platform)
    .where('isDefault', '==', true)
    .get()

  for (const d of existingDefaults.docs) {
    batch.update(d.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() })
  }

  const accountIds: string[] = []

  for (const sel of selections) {
    const option = options[sel.index]
    if (!option) continue

    const encryptedTokens = {
      ...option.encryptedTokens,
      expiresAt: option.encryptedTokens?.expiresAt
        ? (option.encryptedTokens.expiresAt instanceof Date
            ? Timestamp.fromDate(option.encryptedTokens.expiresAt)
            : option.encryptedTokens.expiresAt)
        : null,
    }

    const existing = await adminDb
      .collection('social_accounts')
      .where('orgId', '==', orgId)
      .where('platform', '==', platform)
      .where('platformAccountId', '==', option.platformAccountId)
      .limit(1)
      .get()

    const accountData = {
      orgId,
      platform,
      platformAccountId: option.platformAccountId,
      displayName: option.displayName,
      username: option.username,
      avatarUrl: option.avatarUrl,
      profileUrl: option.profileUrl,
      accountType: option.accountType,
      subAccountType: option.accountType as 'personal' | 'page',
      isDefault: sel.isDefault ?? false,
      status: 'active',
      scopes: option.scopes ?? [],
      encryptedTokens,
      platformMeta: option.platformMeta ?? {},
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (!existing.empty) {
      const ref = existing.docs[0].ref
      batch.update(ref, accountData)
      accountIds.push(existing.docs[0].id)
    } else {
      const ref = adminDb.collection('social_accounts').doc()
      batch.set(ref, {
        ...accountData,
        connectedBy: user?.uid ?? 'unknown',
        connectedAt: FieldValue.serverTimestamp(),
        lastTokenRefresh: null,
        lastUsed: null,
        createdAt: FieldValue.serverTimestamp(),
      })
      accountIds.push(ref.id)
    }
  }

  batch.delete(pendingDoc.ref)
  await batch.commit()

  return apiSuccess({ accountIds }, 201)
}))
