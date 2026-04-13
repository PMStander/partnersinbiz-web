/**
 * POST /api/v1/organizations/[id]/members — add a member to an org
 * Body: { userId: string, role: 'owner' | 'admin' | 'member' }
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { isOwnerOrAdmin, VALID_ROLES } from '@/lib/organizations/helpers'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as Params).params
  const doc = await adminDb.collection('organizations').doc(id).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const data = doc.data()!
  // withAuth('admin') currently blocks client users from this endpoint.
  // This membership check is kept for when lower-privilege roles are introduced.
  if (user.role !== 'admin' && user.role !== 'ai') {
    if (!isOwnerOrAdmin(data.members ?? [], user.uid)) return apiError('Forbidden', 403)
  }

  const body = await req.json().catch(() => ({}))
  const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : ''
  if (!targetUserId) return apiError('userId is required', 400)

  // Verify the target user exists before adding them as a member
  const targetUserDoc = await adminDb.collection('users').doc(targetUserId).get()
  if (!targetUserDoc.exists) return apiError('User not found', 404)

  const role: OrgRole = VALID_ROLES.includes(body.role) ? body.role : 'member'

  const members: Array<{ userId: string; role: OrgRole }> = data.members ?? []
  if (members.some((m) => m.userId === targetUserId)) {
    return apiError('User is already a member', 409)
  }

  await adminDb.collection('organizations').doc(id).update({
    members: FieldValue.arrayUnion({ userId: targetUserId, role }),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ added: true, userId: targetUserId, role }, 201)
})
