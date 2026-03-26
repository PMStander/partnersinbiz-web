/**
 * GET    /api/v1/social/posts/:id  — get a single social post
 * PUT    /api/v1/social/posts/:id  — update a social post (partial)
 * DELETE /api/v1/social/posts/:id  — soft delete (sets status: 'cancelled')
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { SocialPostStatus, SocialPostCategory } from '@/lib/social/types'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: SocialPostStatus[] = ['draft', 'scheduled', 'published', 'failed', 'cancelled']
const VALID_CATEGORIES: SocialPostCategory[] = ['work', 'personal', 'ai', 'sport', 'sa', 'other']

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('social_posts').doc(id).get()
  if (!doc.exists) return apiError('Post not found', 404)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const PUT = withAuth('admin', async (req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('social_posts').doc(id).get()
  if (!doc.exists) return apiError('Post not found', 404)

  const body = await req.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  if ('content' in body) {
    updates.content = body.content as string
  }

  if ('scheduledFor' in body) {
    updates.scheduledFor = Timestamp.fromDate(new Date(body.scheduledFor as string))
  }

  if ('status' in body) {
    if (!VALID_STATUSES.includes(body.status as SocialPostStatus)) {
      return apiError('Invalid status', 400)
    }
    updates.status = body.status as SocialPostStatus
  }

  if ('category' in body) {
    if (!VALID_CATEGORIES.includes(body.category as SocialPostCategory)) {
      return apiError('Invalid category', 400)
    }
    updates.category = body.category as SocialPostCategory
  }

  if ('tags' in body) {
    updates.tags = body.tags as string[]
  }

  if ('threadParts' in body) {
    updates.threadParts = body.threadParts as string[]
  }

  await adminDb.collection('social_posts').doc(id).update(updates)
  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('social_posts').doc(id).get()
  if (!doc.exists) return apiError('Post not found', 404)

  await adminDb.collection('social_posts').doc(id).update({
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
