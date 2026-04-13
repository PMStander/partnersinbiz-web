/**
 * POST /api/v1/social/inbox/webhook — receive engagement events from platforms
 * Validates webhook secret and creates inbox items
 */
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const WEBHOOK_SECRET = process.env.SOCIAL_INBOX_WEBHOOK_SECRET || ''

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret
    const authHeader = req.headers.get('authorization')
    const expectedSecret = `Bearer ${WEBHOOK_SECRET}`

    if (!authHeader || authHeader !== expectedSecret) {
      return apiError('Unauthorized', 401)
    }

    const body = await req.json()

    // Validate required fields
    const { orgId, platform, type, fromUser, content, platformItemId, platformUrl } = body

    if (!orgId || !platform || !type || !fromUser || !content || !platformItemId || !platformUrl) {
      return apiError('Missing required fields', 400)
    }

    // Valid types
    const validTypes = ['comment', 'mention', 'reply', 'dm', 'like', 'share', 'follow']
    if (!validTypes.includes(type)) {
      return apiError(`Invalid type: ${type}`, 400)
    }

    // Check if item already exists (deduplication by platformItemId)
    const existing = await adminDb
      .collection('social_inbox')
      .where('orgId', '==', orgId)
      .where('platformItemId', '==', platformItemId)
      .limit(1)
      .get()

    if (!existing.empty) {
      return apiSuccess(
        {
          id: existing.docs[0].id,
          ...existing.docs[0].data(),
          alreadyExists: true,
        },
        200
      )
    }

    // Create new inbox item
    const newItem = {
      orgId,
      platform,
      type,
      fromUser: {
        name: fromUser.name || '',
        username: fromUser.username || '',
        avatarUrl: fromUser.avatarUrl || '',
        profileUrl: fromUser.profileUrl || '',
      },
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
    console.error('Error processing webhook:', error)
    return apiError('Failed to process webhook', 500)
  }
}
