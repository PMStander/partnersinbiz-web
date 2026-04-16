/**
 * GET /api/v1/webhooks/[id]/deliveries — recent delivery attempts for audit.
 *
 * Query params:
 *   - limit  (default 20, max 100)
 *   - cursor (doc id of the last item from the previous page)
 *
 * Sorted by `deliveredAt desc`.
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export const GET = withAuth('admin', async (req: NextRequest, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params

  const webhookSnap = await adminDb.collection('outbound_webhooks').doc(id).get()
  if (!webhookSnap.exists) return apiError('Webhook not found', 404)

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor')
  const rawLimit = parseInt(searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10)
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )

  try {
    let query = adminDb
      .collection('webhook_deliveries')
      .where('webhookId', '==', id)
      .orderBy('deliveredAt', 'desc') as FirebaseFirestore.Query

    if (cursor) {
      const cursorDoc = await adminDb
        .collection('webhook_deliveries')
        .doc(cursor)
        .get()
      if (cursorDoc.exists) query = query.startAfter(cursorDoc)
    }

    const snap = await query.limit(limit + 1).get()
    const docs = snap.docs
    const hasMore = docs.length > limit
    const pageDocs = hasMore ? docs.slice(0, limit) : docs
    const items = pageDocs.map((d) => ({ id: d.id, ...d.data() }))
    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1].id : null

    return apiSuccess({ items, nextCursor }, 200, {
      total: items.length,
      page: 1,
      limit,
    })
  } catch (err) {
    console.error('[webhook-deliveries-list-error]', err)
    return apiError('Failed to list deliveries', 500)
  }
})
