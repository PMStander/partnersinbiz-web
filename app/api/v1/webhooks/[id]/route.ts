/**
 * /api/v1/webhooks/[id] — single-webhook CRUD.
 *
 *   - GET    admin: fetch one webhook (secret masked).
 *   - PUT    admin: update name / url / events / active.
 *                  (TODO: secret rotation belongs on a dedicated route.)
 *   - DELETE admin: soft-delete.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { VALID_WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/webhooks/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

function redactSecret<T extends Record<string, unknown>>(doc: T): T {
  if ('secret' in doc) return { ...doc, secret: '***' }
  return doc
}

function isHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (
      parsed.protocol === 'http:' &&
      (process.env.NODE_ENV !== 'production' ||
        process.env.WEBHOOKS_ALLOW_HTTP === '1')
    )
      return true
    return false
  } catch {
    return false
  }
}

export const GET = withAuth('admin', async (_req, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('outbound_webhooks').doc(id).get()
  if (!doc.exists) return apiError('Webhook not found', 404)
  const data = doc.data() as Record<string, unknown>
  if (data.deleted === true) return apiError('Webhook not found', 404)
  return apiSuccess(redactSecret({ id: doc.id, ...data }))
})

export const PUT = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    url?: string
    events?: unknown
    active?: boolean
  }

  const ref = adminDb.collection('outbound_webhooks').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Webhook not found', 404)
  const existing = doc.data() as Record<string, unknown>
  if (existing.deleted === true) return apiError('Webhook not found', 404)

  const updates: Record<string, unknown> = { ...lastActorFrom(user) }

  if (body.name !== undefined) {
    if (!body.name) return apiError('name cannot be empty', 400)
    updates.name = String(body.name)
  }
  if (body.url !== undefined) {
    if (!body.url || !isHttpsUrl(body.url)) {
      return apiError(
        'url must be an https URL (http allowed only in non-production)',
        400,
      )
    }
    updates.url = String(body.url)
  }
  if (body.events !== undefined) {
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
    updates.events = body.events as WebhookEvent[]
  }
  if (body.active !== undefined) {
    updates.active = Boolean(body.active)
  }

  // TODO: secret rotation — handled on a dedicated `/rotate-secret` route
  // so that the new secret can be surfaced exactly once.

  try {
    await ref.update(updates)
    return apiSuccess({ id })
  } catch (err) {
    console.error('[webhook-update-error]', err)
    return apiError('Failed to update webhook', 500)
  }
})

export const DELETE = withAuth('admin', async (_req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const ref = adminDb.collection('outbound_webhooks').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Webhook not found', 404)
  try {
    await ref.update({
      deleted: true,
      active: false,
      deletedAt: FieldValue.serverTimestamp(),
      ...lastActorFrom(user),
    })
    return apiSuccess({ deleted: true })
  } catch (err) {
    console.error('[webhook-delete-error]', err)
    return apiError('Failed to delete webhook', 500)
  }
})
