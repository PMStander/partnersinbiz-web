/**
 * PATCH /api/v1/social/inbox/[id] — update inbox item
 * DELETE /api/v1/social/inbox/[id] — delete inbox item
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const PATCH = withAuth('client', withTenant(async (req, _user, orgId) => {
  try {
    const { id } = await req.json().catch(() => ({}))
    const pathname = new URL(req.url).pathname
    const itemId = pathname.split('/').pop()

    if (!itemId) {
      return apiError('Item ID is required', 400)
    }

    const body = await req.json()
    const { status, priority } = body

    // Validate the item belongs to this org
    const itemDoc = await adminDb.collection('social_inbox').doc(itemId).get()
    if (!itemDoc.exists || itemDoc.data()?.orgId !== orgId) {
      return apiError('Inbox item not found', 404)
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (status && ['unread', 'read', 'replied', 'archived'].includes(status)) {
      updates.status = status
    }

    if (priority && ['high', 'normal', 'low'].includes(priority)) {
      updates.priority = priority
    }

    if (Object.keys(updates).length === 1) {
      // Only updatedAt was set
      return apiError('No valid updates provided', 400)
    }

    await adminDb.collection('social_inbox').doc(itemId).update(updates)

    const updated = await adminDb.collection('social_inbox').doc(itemId).get()
    return apiSuccess({
      id: itemId,
      ...updated.data(),
    })
  } catch (error) {
    console.error('Error updating inbox item:', error)
    return apiError('Failed to update inbox item', 500)
  }
}))

export const DELETE = withAuth('client', withTenant(async (req, _user, orgId) => {
  try {
    const pathname = new URL(req.url).pathname
    const itemId = pathname.split('/').pop()

    if (!itemId) {
      return apiError('Item ID is required', 400)
    }

    // Validate the item belongs to this org
    const itemDoc = await adminDb.collection('social_inbox').doc(itemId).get()
    if (!itemDoc.exists || itemDoc.data()?.orgId !== orgId) {
      return apiError('Inbox item not found', 404)
    }

    await adminDb.collection('social_inbox').doc(itemId).delete()

    return apiSuccess({ id: itemId, deleted: true })
  } catch (error) {
    console.error('Error deleting inbox item:', error)
    return apiError('Failed to delete inbox item', 500)
  }
}))
