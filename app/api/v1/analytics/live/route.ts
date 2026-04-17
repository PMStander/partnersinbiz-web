import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

const LIVE_WINDOW_MS = 5 * 60 * 1000
const MAX_LIVE_EVENTS = 100

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  if (!propertyId) return apiError('propertyId required', 400)

  const since = new Date(Date.now() - LIVE_WINDOW_MS)

  const snap = await adminDb.collection('product_events')
    .where('propertyId', '==', propertyId)
    .where('serverTime', '>=', since)
    .orderBy('serverTime', 'desc')
    .limit(MAX_LIVE_EVENTS)
    .get()

  const events = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  return apiSuccess({ events, since: since.toISOString() })
})
