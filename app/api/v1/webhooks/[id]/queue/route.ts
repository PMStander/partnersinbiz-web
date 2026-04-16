/**
 * GET /api/v1/webhooks/[id]/queue
 *
 * Queue items for a specific webhook — pending, delivering, delivered,
 * or failed. Useful for debugging a slow/broken endpoint.
 *
 * Query: status (optional), limit (default 20, max 100), cursor (doc id).
 * Response: `{ items: [...], nextCursor: id | null }`
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['pending', 'delivering', 'delivered', 'failed']

export const GET = withAuth('admin', async (req, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
  const cursor = searchParams.get('cursor')

  if (status && !VALID_STATUSES.includes(status)) {
    return apiError(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`, 400)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection('webhook_queue')
    .where('webhookId', '==', id)
    .orderBy('createdAt', 'desc')

  if (status) query = query.where('status', '==', status)

  if (cursor) {
    const cursorDoc = await adminDb.collection('webhook_queue').doc(cursor).get()
    if (cursorDoc.exists) query = query.startAfter(cursorDoc)
  }

  const snap = await query.limit(limit + 1).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  const items = all.slice(0, limit)
  const nextCursor = all.length > limit ? items[items.length - 1].id : null

  return apiSuccess({ items, nextCursor })
})
