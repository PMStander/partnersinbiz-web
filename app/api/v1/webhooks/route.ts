/**
 * /api/v1/webhooks — list + create outbound webhooks.
 *
 *   - GET   admin: filter by `orgId`, `active`; cursor paginated.
 *             The `secret` field is redacted (`'***'`) on all reads.
 *   - POST  admin: create a subscription. The signing secret is returned
 *             ONCE on create (field `secretOnce`). Save it — subsequent GETs
 *             will mask it.
 */
import { NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import { VALID_WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/webhooks/types'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function redactSecret<T extends Record<string, unknown>>(doc: T): T {
  if ('secret' in doc) {
    return { ...doc, secret: '***' }
  }
  return doc
}

function isHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    // Allow http only in non-production or when explicitly enabled.
    if (
      parsed.protocol === 'http:' &&
      (process.env.NODE_ENV !== 'production' ||
        process.env.WEBHOOKS_ALLOW_HTTP === '1')
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required', 400)

  const activeParam = searchParams.get('active')
  const cursor = searchParams.get('cursor')
  const rawLimit = parseInt(searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10)
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )

  try {
    let query = adminDb
      .collection('outbound_webhooks')
      .where('orgId', '==', orgId)
      .where('deleted', '==', false) as FirebaseFirestore.Query

    if (activeParam === 'true') query = query.where('active', '==', true)
    else if (activeParam === 'false') query = query.where('active', '==', false)

    query = query.orderBy('createdAt', 'desc')

    if (cursor) {
      const cursorDoc = await adminDb
        .collection('outbound_webhooks')
        .doc(cursor)
        .get()
      if (cursorDoc.exists) query = query.startAfter(cursorDoc)
    }

    const snap = await query.limit(limit + 1).get()
    const docs = snap.docs
    const hasMore = docs.length > limit
    const pageDocs = hasMore ? docs.slice(0, limit) : docs
    const items = pageDocs.map((d) =>
      redactSecret({ id: d.id, ...d.data() } as Record<string, unknown>),
    )
    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1].id : null

    return apiSuccess({ items, nextCursor }, 200, {
      total: items.length,
      page: 1,
      limit,
    })
  } catch (err) {
    console.error('[webhooks-list-error]', err)
    return apiError('Failed to list webhooks', 500)
  }
})

export const POST = withAuth('admin', async (req, user) => {
  const body = (await req.json().catch(() => ({}))) as {
    orgId?: string
    name?: string
    url?: string
    events?: unknown
    secret?: string
  }

  if (!body.orgId) return apiError('orgId is required', 400)
  if (!body.name) return apiError('name is required', 400)
  if (!body.url) return apiError('url is required', 400)
  if (!isHttpsUrl(body.url)) {
    return apiError(
      'url must be an https URL (http allowed only in non-production)',
      400,
    )
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return apiError('events must be a non-empty array', 400)
  }
  const invalid = (body.events as string[]).filter(
    (e) => !VALID_WEBHOOK_EVENTS.includes(e as WebhookEvent),
  )
  if (invalid.length) {
    return apiError(
      `Invalid events: ${invalid.join(', ')}. Allowed: ${VALID_WEBHOOK_EVENTS.join(', ')}`,
      400,
    )
  }

  const secret = body.secret?.trim() || randomBytes(32).toString('hex')

  const doc = {
    orgId: String(body.orgId),
    name: String(body.name),
    url: String(body.url),
    events: body.events as WebhookEvent[],
    secret,
    active: true,
    failureCount: 0,
    lastDeliveredAt: null,
    lastFailureAt: null,
    autoDisabledAt: null,
    ...actorFrom(user),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  }

  try {
    const ref = await adminDb.collection('outbound_webhooks').add(doc)
    return apiSuccess(
      {
        id: ref.id,
        // Returned exactly once — subsequent reads mask the secret as '***'.
        secretOnce: secret,
        secret: '***',
        _note:
          'Store the `secretOnce` value now — it cannot be retrieved later.',
      },
      201,
    )
  } catch (err) {
    console.error('[webhooks-create-error]', err)
    return apiError('Failed to create webhook', 500)
  }
})
