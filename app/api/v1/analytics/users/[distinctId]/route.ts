import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

type RouteContext = { params: Promise<{ distinctId: string }> }

export const GET = withAuth('admin', async (req: NextRequest, ctx: unknown) => {
  const { distinctId } = await (ctx as RouteContext).params
  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 2000)

  if (!propertyId) return apiError('propertyId required', 400)

  const [eventsSnap, sessionsSnap] = await Promise.all([
    adminDb.collection('product_events')
      .where('propertyId', '==', propertyId)
      .where('distinctId', '==', distinctId)
      .orderBy('serverTime', 'desc')
      .limit(limit)
      .get(),
    adminDb.collection('product_sessions')
      .where('propertyId', '==', propertyId)
      .where('distinctId', '==', distinctId)
      .orderBy('startedAt', 'desc')
      .limit(50)
      .get(),
  ])

  if (eventsSnap.empty) return apiError('User not found', 404)

  const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const sessions = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  return apiSuccess({ distinctId, events, sessions })
})

export const DELETE = withAuth('admin', async (req: NextRequest, ctx: unknown) => {
  const { distinctId } = await (ctx as RouteContext).params
  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  if (!propertyId) return apiError('propertyId required', 400)

  const [eventsSnap, sessionsSnap] = await Promise.all([
    adminDb.collection('product_events')
      .where('propertyId', '==', propertyId)
      .where('distinctId', '==', distinctId)
      .limit(500)
      .get(),
    adminDb.collection('product_sessions')
      .where('propertyId', '==', propertyId)
      .where('distinctId', '==', distinctId)
      .limit(200)
      .get(),
  ])

  const batch = adminDb.batch()
  for (const doc of eventsSnap.docs) batch.delete(doc.ref)
  for (const doc of sessionsSnap.docs) batch.delete(doc.ref)
  await batch.commit()

  return apiSuccess({ deleted: { events: eventsSnap.size, sessions: sessionsSnap.size } })
})
