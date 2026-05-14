/**
 * PATCH /api/v1/organizations/[id]/members/[userId] — update member role
 * DELETE /api/v1/organizations/[id]/members/[userId] — remove a member
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { logActivity } from '@/lib/activity/log'
import type { Organization, OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; userId: string }> }

export const PATCH = withAuth('admin', async (req, user, ctx) => {
  const { id, userId: targetUserId } = await (ctx as Params).params

  // Parse request body
  const body = await req.json().catch(() => ({}))
  const newRole = body.role as OrgRole | undefined

  if (!newRole) return apiError('role is required', 400)

  // Validate role
  const validRoles: OrgRole[] = ['owner', 'admin', 'member', 'viewer']
  if (!validRoles.includes(newRole)) {
    return apiError(`role must be one of: ${validRoles.join(', ')}`, 400)
  }

  // Fetch organization
  const orgDoc = await adminDb.collection('organizations').doc(id).get()
  if (!orgDoc.exists) return apiError('Organisation not found', 404)

  const org = orgDoc.data() as Organization
  const members = org.members ?? []

  // Find the member
  const memberIndex = members.findIndex((m) => m.userId === targetUserId)
  if (memberIndex === -1) return apiError('User is not a member', 404)

  const member = members[memberIndex]

  // Check if trying to demote the last owner
  if (member.role === 'owner' && newRole !== 'owner') {
    const remainingOwners = members.filter((m) => m.role === 'owner' && m.userId !== targetUserId)
    if (remainingOwners.length === 0) {
      return apiError('Cannot demote the last owner. Assign another owner first.', 409)
    }
  }

  // Update the member role
  const updatedMembers = [...members]
  updatedMembers[memberIndex] = {
    ...member,
    role: newRole,
  }

  await adminDb.collection('organizations').doc(id).update({
    members: updatedMembers,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ ...updatedMembers[memberIndex] }, 200)
})

export const DELETE = withAuth('admin', async (req, user, ctx) => {
  const { id, userId: targetUserId } = await (ctx as Params).params

  // Fetch organization
  const orgDoc = await adminDb.collection('organizations').doc(id).get()
  if (!orgDoc.exists) return apiError('Organisation not found', 404)

  const org = orgDoc.data() as Organization
  const members = org.members ?? []

  // Find the member
  const memberIndex = members.findIndex((m) => m.userId === targetUserId)
  if (memberIndex === -1) return apiError('User is not a member', 404)

  const member = members[memberIndex]

  // Prevent removing the last owner
  if (member.role === 'owner') {
    const remainingOwners = members.filter((m) => m.role === 'owner' && m.userId !== targetUserId)
    if (remainingOwners.length === 0) {
      return apiError('Cannot remove the last owner. Assign another owner first.', 409)
    }
  }

  // Remove the member
  const updatedMembers = members.filter((m) => m.userId !== targetUserId)

  await adminDb.collection('organizations').doc(id).update({
    members: updatedMembers,
    updatedAt: FieldValue.serverTimestamp(),
  })
  logActivity({
    orgId: id,
    type: 'org_member_removed',
    actorId: user.uid,
    actorName: user.uid,
    actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    description: 'Removed member from organization',
    entityId: targetUserId,
    entityType: 'organization',
  }).catch(() => {})

  return apiSuccess({ removed: true, userId: targetUserId })
})
