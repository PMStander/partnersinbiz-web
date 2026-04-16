import { createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { signPayload } from './sign'
import {
  WEBHOOK_AUTO_DISABLE_THRESHOLD,
  WEBHOOK_MAX_RETRIES,
  WEBHOOK_RETRY_BACKOFF_MS,
  type OutboundWebhook,
  type WebhookEvent,
} from './types'

const RESPONSE_BODY_MAX_BYTES = 2 * 1024 // 2KB
const REQUEST_TIMEOUT_MS = 10_000
const QUEUE_TERMINAL_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7d retention on delivered/failed queue items
const DELIVERY_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90d audit retention on webhook_deliveries

interface WorkerOptions {
  maxBatch?: number
}

interface WorkerResult {
  processed: number
  delivered: number
  failed: number
}

/**
 * Process pending webhook queue items.
 *
 * 1. Fetch up to `maxBatch` queue docs where `status == 'pending'` and
 *    `nextAttemptAt <= now`, ordered by `nextAttemptAt asc`.
 * 2. For each item, atomically claim it via a transaction that flips
 *    `status: pending -> delivering` and stamps `claimedAt`. Items already
 *    claimed by a parallel run are skipped.
 * 3. Load the webhook doc (cached per run by `webhookId`) and POST the signed
 *    payload to its URL with a 10s timeout.
 * 4. On 2xx: mark `delivered`, reset webhook `failureCount`, stamp
 *    `lastDeliveredAt`.
 * 5. On non-2xx / timeout / network error: either schedule a retry (bump
 *    `retryCount`, set `nextAttemptAt = now + backoff[retryCount]`) or, if
 *    `retryCount >= WEBHOOK_MAX_RETRIES`, mark the item `failed` and bump the
 *    webhook's `failureCount`. When `failureCount >= WEBHOOK_AUTO_DISABLE_THRESHOLD`
 *    the webhook is auto-disabled (`active: false`, `autoDisabledAt: now`).
 * 6. Always write a `webhook_deliveries` audit record, success or failure.
 *
 * Per-item errors are caught so one bad webhook cannot tank the whole batch.
 */
export async function processPendingWebhooks(
  opts: WorkerOptions = {},
): Promise<WorkerResult> {
  const maxBatch = opts.maxBatch ?? 20
  const result: WorkerResult = { processed: 0, delivered: 0, failed: 0 }

  const now = Timestamp.now()

  const snap = await adminDb
    .collection('webhook_queue')
    .where('status', '==', 'pending')
    .where('nextAttemptAt', '<=', now)
    .orderBy('nextAttemptAt', 'asc')
    .limit(maxBatch)
    .get()

  if (snap.empty) return result

  const webhookCache = new Map<string, OutboundWebhook | null>()

  for (const queueDoc of snap.docs) {
    try {
      // --- Atomic claim -----------------------------------------------------
      const claimed = await adminDb.runTransaction(async (tx) => {
        const ref = queueDoc.ref
        const fresh = await tx.get(ref)
        if (!fresh.exists) return false
        const data = fresh.data() as { status?: string } | undefined
        if (data?.status !== 'pending') return false
        tx.update(ref, {
          status: 'delivering',
          claimedAt: FieldValue.serverTimestamp(),
        })
        return true
      })

      if (!claimed) continue
      result.processed++

      const itemData = queueDoc.data() as {
        webhookId: string
        orgId: string
        event: WebhookEvent | 'test'
        payload: Record<string, unknown>
        retryCount: number
      }

      // --- Load webhook (cache per run) ------------------------------------
      let webhook = webhookCache.get(itemData.webhookId) ?? null
      if (!webhookCache.has(itemData.webhookId)) {
        const whSnap = await adminDb
          .collection('outbound_webhooks')
          .doc(itemData.webhookId)
          .get()
        webhook = whSnap.exists
          ? ({ id: whSnap.id, ...(whSnap.data() as object) } as OutboundWebhook)
          : null
        webhookCache.set(itemData.webhookId, webhook)
      }

      // If the webhook is gone (deleted), mark the item failed and move on.
      if (!webhook || webhook.deleted) {
        await queueDoc.ref.update({
          status: 'failed',
          claimedAt: null,
          expiresAt: Timestamp.fromMillis(Date.now() + QUEUE_TERMINAL_TTL_MS),
        })
        await writeDelivery({
          webhookId: itemData.webhookId,
          queueItemId: queueDoc.id,
          event: itemData.event,
          payload: itemData.payload,
          attemptNumber: (itemData.retryCount ?? 0) + 1,
          responseStatus: null,
          responseHeaders: {},
          responseBody: '',
          durationMs: 0,
          error: 'Webhook not found or deleted',
        })
        result.failed++
        continue
      }

      // --- Build request ---------------------------------------------------
      const body = JSON.stringify(itemData.payload)
      const timestamp = Date.now()
      const deliveryRef = adminDb.collection('webhook_deliveries').doc()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-PIB-Event': String(itemData.event),
        'X-PIB-Delivery-Id': deliveryRef.id,
        'X-PIB-Timestamp': String(timestamp),
        'X-PIB-Signature': signPayload(webhook.secret, body, timestamp),
      }

      // --- Deliver ---------------------------------------------------------
      const attemptNumber = (itemData.retryCount ?? 0) + 1
      const start = Date.now()
      let responseStatus: number | null = null
      let responseHeaders: Record<string, string> = {}
      let responseBody = ''
      let error: string | null = null

      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        responseStatus = res.status
        responseHeaders = flattenHeaders(res.headers)
        responseBody = truncateBody(await safeReadText(res))
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }

      const durationMs = Date.now() - start
      const success =
        responseStatus !== null && responseStatus >= 200 && responseStatus < 300

      // --- Persist delivery audit ------------------------------------------
      await writeDelivery({
        ref: deliveryRef,
        webhookId: webhook.id,
        queueItemId: queueDoc.id,
        event: itemData.event,
        payload: itemData.payload,
        attemptNumber,
        responseStatus,
        responseHeaders,
        responseBody,
        durationMs,
        error,
      })

      // --- Update queue item + webhook -------------------------------------
      if (success) {
        await queueDoc.ref.update({
          status: 'delivered',
          deliveredAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + QUEUE_TERMINAL_TTL_MS),
        })
        await adminDb
          .collection('outbound_webhooks')
          .doc(webhook.id)
          .update({
            lastDeliveredAt: FieldValue.serverTimestamp(),
            failureCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          })
        result.delivered++
      } else {
        const nextRetry = attemptNumber // = retryCount + 1 (next slot)
        if (nextRetry > WEBHOOK_MAX_RETRIES) {
          // Out of retries — fail the item and bump webhook failureCount.
          await queueDoc.ref.update({
            status: 'failed',
            expiresAt: Timestamp.fromMillis(Date.now() + QUEUE_TERMINAL_TTL_MS),
          })
          const newFailureCount = (webhook.failureCount ?? 0) + 1
          const disable = newFailureCount >= WEBHOOK_AUTO_DISABLE_THRESHOLD
          const webhookUpdate: Record<string, unknown> = {
            failureCount: newFailureCount,
            lastFailureAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }
          if (disable) {
            webhookUpdate.active = false
            webhookUpdate.autoDisabledAt = FieldValue.serverTimestamp()
          }
          await adminDb
            .collection('outbound_webhooks')
            .doc(webhook.id)
            .update(webhookUpdate)
          // Keep the in-memory cache in sync so subsequent items in this run
          // see the disabled state.
          if (disable) {
            webhook.active = false
          }
          webhook.failureCount = newFailureCount
          result.failed++
        } else {
          const backoffMs =
            WEBHOOK_RETRY_BACKOFF_MS[nextRetry] ??
            WEBHOOK_RETRY_BACKOFF_MS[WEBHOOK_RETRY_BACKOFF_MS.length - 1]
          const nextAt = Timestamp.fromMillis(Date.now() + backoffMs)
          await queueDoc.ref.update({
            status: 'pending',
            retryCount: nextRetry,
            nextAttemptAt: nextAt,
            claimedAt: null,
          })
          // Record the failure on the webhook too (helps surface flaky endpoints).
          await adminDb
            .collection('outbound_webhooks')
            .doc(webhook.id)
            .update({
              lastFailureAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            })
        }
      }
    } catch (err) {
      // Per-item safety net — a single broken doc must not abort the batch.
      console.error('[webhook-worker-item-error]', queueDoc.id, err)
      try {
        await queueDoc.ref.update({
          status: 'pending',
          claimedAt: null,
        })
      } catch {
        // give up silently — the next cron pass will retry
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateBody(body: string): string {
  if (!body) return ''
  // Count bytes, not chars — 2KB budget.
  const bytes = Buffer.byteLength(body, 'utf8')
  if (bytes <= RESPONSE_BODY_MAX_BYTES) return body
  // Slice by bytes, decode back — may drop trailing partial multi-byte char.
  return Buffer.from(body, 'utf8')
    .subarray(0, RESPONSE_BODY_MAX_BYTES)
    .toString('utf8')
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function flattenHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((value, key) => {
    out[key] = value
  })
  return out
}

interface DeliveryWrite {
  ref?: FirebaseFirestore.DocumentReference
  webhookId: string
  queueItemId: string
  event: WebhookEvent | 'test'
  payload: Record<string, unknown>
  attemptNumber: number
  responseStatus: number | null
  responseHeaders: Record<string, string>
  responseBody: string
  durationMs: number
  error: string | null
}

async function writeDelivery(d: DeliveryWrite): Promise<void> {
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(d.payload))
    .digest('hex')
  const ref = d.ref ?? adminDb.collection('webhook_deliveries').doc()
  await ref.set({
    webhookId: d.webhookId,
    queueItemId: d.queueItemId,
    event: d.event,
    payloadHash,
    responseStatus: d.responseStatus,
    responseHeaders: d.responseHeaders,
    responseBody: d.responseBody,
    durationMs: d.durationMs,
    attemptNumber: d.attemptNumber,
    deliveredAt: FieldValue.serverTimestamp(),
    error: d.error,
    expiresAt: Timestamp.fromMillis(Date.now() + DELIVERY_TTL_MS),
  })
}
