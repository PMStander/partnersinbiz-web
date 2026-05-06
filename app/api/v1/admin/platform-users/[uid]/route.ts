/**
 * GET    /api/v1/admin/platform-users/[uid] — get one platform admin user
 * PATCH  /api/v1/admin/platform-users/[uid] — update displayName / allowedOrgIds
 * DELETE /api/v1/admin/platform-users/[uid] — remove platform admin
 *
 * Super admin only — see ../route.ts for rationale.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { isSuperAdmin } from '@/lib/api/platformAdmin'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ uid: string }> }

function sanitiseAllowedOrgIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed && !out.includes(trimmed)) out.push(trimmed)
    }
  }
  return out
}

export const GET = withAuth('admin', async (req: NextRequest, user, ctx) => {
  if (!isSuperAdmin(user)) return apiError('Only super admins can access platform users', 403)
  const { uid } = await (ctx as Params).params

  const doc = await adminDb.collection('users').doc(uid).get()
  if (!doc.exists) return apiError('User not found', 404)
  const data = doc.data() ?? {}
  if (data.role !== 'admin') return apiError('Not a platform admin', 404)

  const allowedOrgIds = sanitiseAllowedOrgIds(data.allowedOrgIds)
  return apiSuccess({
    uid,
    email: typeof data.email === 'string' ? data.email : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    role: 'admin' as const,
    orgId: typeof data.orgId === 'string' ? data.orgId : undefined,
    allowedOrgIds,
    isSuperAdmin: allowedOrgIds.length === 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  })
})

export const PATCH = withAuth('admin', async (req: NextRequest, user, ctx) => {
  if (!isSuperAdmin(user)) return apiError('Only super admins can edit platform users', 403)
  const { uid } = await (ctx as Params).params

  const body = await req.json().catch(() => ({}))
  const ref = adminDb.collection('users').doc(uid)
  const doc = await ref.get()
  if (!doc.exists) return apiError('User not found', 404)
  if (doc.data()?.role !== 'admin') return apiError('Not a platform admin', 404)

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return apiError('name cannot be empty', 400)
    update.displayName = name
    try {
      await adminAuth.updateUser(uid, { displayName: name })
    } catch (err) {
      console.error('[platform-users] auth displayName update failed', err)
    }
  }

  if (Array.isArray(body.allowedOrgIds)) {
    const allowed = sanitiseAllowedOrgIds(body.allowedOrgIds)
    // Guardrail: prevent demoting yourself to a restricted admin via this
    // endpoint — that's an easy way to lock yourself out of platform admin
    // management. Use a different super-admin's account if you really need to.
    if (uid === user.uid && allowed.length > 0) {
      return apiError('You cannot restrict your own account here. Ask another super admin.', 400)
    }
    update.allowedOrgIds = allowed
  }

  await ref.set(update, { merge: true })

  const fresh = (await ref.get()).data() ?? {}
  const allowedOrgIds = sanitiseAllowedOrgIds(fresh.allowedOrgIds)
  return apiSuccess({
    uid,
    email: typeof fresh.email === 'string' ? fresh.email : '',
    displayName: typeof fresh.displayName === 'string' ? fresh.displayName : '',
    role: 'admin' as const,
    orgId: typeof fresh.orgId === 'string' ? fresh.orgId : undefined,
    allowedOrgIds,
    isSuperAdmin: allowedOrgIds.length === 0,
  })
})

export const DELETE = withAuth('admin', async (req: NextRequest, user, ctx) => {
  if (!isSuperAdmin(user)) return apiError('Only super admins can remove platform users', 403)
  const { uid } = await (ctx as Params).params

  if (uid === user.uid) {
    return apiError('You cannot remove your own account', 400)
  }

  const ref = adminDb.collection('users').doc(uid)
  const doc = await ref.get()
  if (!doc.exists) return apiError('User not found', 404)
  if (doc.data()?.role !== 'admin') return apiError('Not a platform admin', 404)

  // Delete Firebase Auth user (revokes any sessions). Best-effort — Firestore
  // doc removal is the source of truth for role.
  try {
    await adminAuth.deleteUser(uid)
  } catch (err) {
    const code = (err as { code?: string } | null)?.code
    if (code !== 'auth/user-not-found') {
      console.error('[platform-users] auth delete failed', err)
    }
  }

  await ref.delete()
  return apiSuccess({ uid, deleted: true })
})
