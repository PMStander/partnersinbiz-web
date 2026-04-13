import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const limitStr = searchParams.get('limit') ?? '20'
  const limit = Math.min(Math.max(1, parseInt(limitStr, 10) || 20), 100)

  if (!orgId) {
    return apiError('orgId query param is required', 400)
  }

  try {
    const snapshot = await adminDb
      .collection('activity')
      .where('orgId', '==', orgId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    return apiSuccess(events)
  } catch (err) {
    console.error('[Activity API] Error:', err)
    return apiError('Failed to fetch activity', 500)
  }
})
