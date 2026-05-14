/**
 * Server-side Firebase Cloud Messaging helpers.
 *
 * Token storage lives at `pushTokens/{tokenHash}` (keyed by a hash of the
 * actual token so the doc id is safe for URLs and we don't expose tokens in
 * Firestore audit logs). Each doc stores the raw token plus owner metadata
 * so we can target by user, org, or topic later.
 *
 * Stale tokens (returned by FCM with `messaging/registration-token-not-registered`)
 * are pruned on send so we don't keep retrying them.
 */
import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import type { Message, MulticastMessage } from 'firebase-admin/messaging'
import { adminDb, getAdminApp } from '@/lib/firebase/admin'

export interface PushTokenDoc {
  token: string
  uid: string
  orgId: string | null
  platform: 'web' | 'ios' | 'android'
  userAgent?: string | null
  createdAt: unknown
  updatedAt: unknown
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)
}

export async function saveDeviceToken(opts: {
  token: string
  uid: string
  orgId?: string | null
  platform?: PushTokenDoc['platform']
  userAgent?: string | null
}): Promise<{ id: string }> {
  const id = hashToken(opts.token)
  const ref = adminDb.collection('pushTokens').doc(id)
  const now = FieldValue.serverTimestamp()
  const snap = await ref.get()
  const base = {
    token: opts.token,
    uid: opts.uid,
    orgId: opts.orgId ?? null,
    platform: opts.platform ?? 'web',
    userAgent: opts.userAgent ?? null,
    updatedAt: now,
  }
  if (snap.exists) {
    await ref.update(base)
  } else {
    await ref.set({ ...base, createdAt: now })
  }
  return { id }
}

export async function deleteDeviceToken(token: string): Promise<void> {
  await adminDb.collection('pushTokens').doc(hashToken(token)).delete().catch(() => undefined)
}

export async function getTokensForUser(uid: string): Promise<PushTokenDoc[]> {
  const snap = await adminDb.collection('pushTokens').where('uid', '==', uid).get()
  return snap.docs.map((d) => d.data() as PushTokenDoc)
}

export interface PushPayload {
  title: string
  body: string
  link?: string
  icon?: string
  data?: Record<string, string>
}

function buildMessage(payload: PushPayload): Pick<Message, 'notification' | 'data' | 'webpush'> {
  const data: Record<string, string> = { ...(payload.data ?? {}) }
  if (payload.link) data.url = payload.link
  data.title = payload.title
  data.body = payload.body
  return {
    notification: { title: payload.title, body: payload.body },
    data,
    webpush: {
      notification: {
        icon: payload.icon ?? '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
      },
      fcmOptions: payload.link ? { link: payload.link } : undefined,
    },
  }
}

export interface PushSendResult {
  attempted: number
  delivered: number
  pruned: number
}

/**
 * Send a push to every device registered for `uid`. Silently no-ops if FCM
 * isn't configured (e.g. local dev without admin creds).
 */
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<PushSendResult> {
  if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    return { attempted: 0, delivered: 0, pruned: 0 }
  }
  const tokens = await getTokensForUser(uid)
  if (tokens.length === 0) return { attempted: 0, delivered: 0, pruned: 0 }

  const messaging = getMessaging(getAdminApp())
  const message: MulticastMessage = {
    tokens: tokens.map((t) => t.token),
    ...buildMessage(payload),
  }

  let response
  try {
    response = await messaging.sendEachForMulticast(message)
  } catch (err) {
    console.error('[push] sendEachForMulticast failed', err)
    return { attempted: tokens.length, delivered: 0, pruned: 0 }
  }

  let pruned = 0
  await Promise.all(
    response.responses.map(async (r, i) => {
      if (r.success) return
      const code = r.error?.code ?? ''
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        pruned += 1
        await deleteDeviceToken(tokens[i].token)
      } else {
        console.warn('[push] delivery failed', code, r.error?.message)
      }
    }),
  )

  return {
    attempted: tokens.length,
    delivered: response.successCount,
    pruned,
  }
}
