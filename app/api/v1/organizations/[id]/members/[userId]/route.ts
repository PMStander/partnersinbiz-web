/**
 * DELETE /api/v1/organizations/[id]/members/[userId] — remove a member
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { isOwnerOrAdmin, isMember } from '@/lib/organizations/helpers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; userId: string }> }

export const DELETE = withAuth('admin', async (req, user, ctx) => {
  const { id, userId: targetUserId } = await (ctx as Params).params
  const doc = await adminDb.collection('organizations').doc(id).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const data = doc.data()!
  // This guard is unreachable with current roles ('admin', 'client', 'ai') because withAuth('admin') blocks clients.
  // Kept intentionally for when lower-privilege roles are introduced.
  if (user.role !== 'admin' && user.role !== 'ai') {
    if (!isOwnerOrAdmin(data.members ?? [], user.uid)) return apiError('Forbidden', 403)
  }

  const members: Array<{ userId: string; role: string }> = data.members ?? []
  if (!isMember(members as any, targetUserId)) {
    return apiError('User is not a member', 404)
  }

  const memberEntry = members.find((m) => m.userId === targetUserId)
  if (!memberEntry) return apiError('Member not found', 404)

  await adminDb.collection('organizations').doc(id).update({
    members: FieldValue.arrayRemove(memberEntry),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ removed: true, userId: targetUserId })
})
