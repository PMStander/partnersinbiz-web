/**
 * GET /api/v1/social/inbox — list inbox engagement items
 * POST /api/v1/social/inbox — create inbox item (for webhooks)
 */
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type EngagementType = 'comment' | 'mention' | 'reply' | 'dm' | 'like' | 'share' | 'follow'
type EngagementStatus = 'unread' | 'read' | 'replied' | 'archived'
type SentimentType = 'positive' | 'neutral' | 'negative' | null

export interface InboxItem {
  id: string
  orgId: string
  platform: string
  type: EngagementType
  fromUser: {
    name: string
    username: string
    avatarUrl: string
    profileUrl: string
  }
  content: string
  postId: string | null
  platformItemId: string
  platformUrl: string
  status: EngagementStatus
  priority: 'high' | 'normal' | 'low'
  sentiment: SentimentType
  createdAt: Timestamp
  updatedAt: Timestamp
}

export const GET = withAuth('client', withTenant(async (req, _user, orgId) => {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const platform = searchParams.get('platform')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const startAfterCursor = searchParams.get('startAfter')

    // Build query
    let query = adminDb.collection('social_inbox').where('orgId', '==', orgId)

    if (status) {
      query = query.where('status', '==', status)
    }
    if (type) {
      query = query.where('type', '==', type)
    }
    if (platform) {
      query = query.where('platform', '==', platform)
    }

    // Order by createdAt descending
    query = query.orderBy('createdAt', 'desc')

    // Pagination
    if (startAfterCursor) {
      const startDoc = await adminDb.collection('social_inbox').doc(startAfterCursor).get()
      if (startDoc.exists) {
        query = query.startAfter(startDoc)
      }
    }

    // Fetch limit + 1 to determine if there are more
    const snapshot = await query.limit(limit + 1).get()
    const docs = snapshot.docs
    const hasMore = docs.length > limit
    const items = docs.slice(0, limit).map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as (InboxItem & { id: string })[]

    return apiSuccess({
      items,
      hasMore,
      cursor: items.length > 0 ? items[items.length - 1].id : null,
    })
  } catch (error) {
    console.error('Error fetching inbox:', error)
    return apiError('Failed to fetch inbox', 500)
  }
}))

export const POST = withAuth('client', withTenant(async (req, _user, orgId) => {
  try {
    const body = await req.json()

    // Validate required fields
    const { platform, type, fromUser, content, platformItemId, platformUrl } = body

    if (!platform || !type || !fromUser || !content || !platformItemId || !platformUrl) {
      return apiError('Missing required fields', 400)
    }

    const newItem: Omit<InboxItem, 'id'> = {
      orgId,
      platform,
      type,
      fromUser,
      content,
      postId: body.postId || null,
      platformItemId,
      platformUrl,
      status: 'unread',
      priority: body.priority || 'normal',
      sentiment: body.sentiment || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }

    const docRef = await adminDb.collection('social_inbox').add(newItem)

    return apiSuccess(
      {
        id: docRef.id,
        ...newItem,
      },
      201
    )
  } catch (error) {
    console.error('Error creating inbox item:', error)
    return apiError('Failed to create inbox item', 500)
  }
}))
