/**
 * Social Queue Processor — Processes scheduled posts from the social_queue collection.
 *
 * Features:
 *  - Optimistic locking via lockedBy/lockedAt fields
 *  - Stale lock detection (5 minute threshold)
 *  - Exponential backoff retry (60s → 300s → 900s → 3600s, max 5 attempts)
 *  - 1-minute precision scheduling
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { getDefaultProvider } from '@/lib/social/providers'
import type { SocialPlatformType } from '@/lib/social/providers'
import crypto from 'crypto'

/** Backoff schedule in seconds: 1min, 5min, 15min, 1hr */
const BACKOFF_SCHEDULE = [60, 300, 900, 3600]

/** Locks older than this are considered stale and can be reclaimed */
const STALE_LOCK_SECONDS = 5 * 60

/** Unique instance ID for this cron invocation */
function generateInstanceId(): string {
  return `cron-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

/** Map legacy platform names to provider platform types */
function toPlatformType(platform: string): SocialPlatformType | null {
  if (platform === 'x' || platform === 'twitter') return 'twitter'
  if (platform === 'linkedin') return 'linkedin'
  return null
}

/** Get the backoff duration for a given attempt number */
function getBackoffSeconds(attempt: number): number {
  return BACKOFF_SCHEDULE[Math.min(attempt, BACKOFF_SCHEDULE.length - 1)]
}

export interface QueueProcessResult {
  processed: number
  failed: number
  skipped: number
  errors: Array<{ postId: string; error: string }>
}

/**
 * Process all due items in the social_queue.
 * Called by the cron endpoint on a 1-minute interval.
 */
export async function processQueue(): Promise<QueueProcessResult> {
  const instanceId = generateInstanceId()
  const now = Timestamp.now()
  const result: QueueProcessResult = { processed: 0, failed: 0, skipped: 0, errors: [] }

  // 1. Fetch pending queue entries that are due
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingSnap = await (adminDb.collection('social_queue') as any)
    .where('status', '==', 'pending')
    .get()

  // 2. Also fetch entries in retry state that are due for retry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processingSnap = await (adminDb.collection('social_queue') as any)
    .where('status', '==', 'processing')
    .get()

  // Combine and filter in-memory for items that are due
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allDocs = [...pendingSnap.docs, ...processingSnap.docs]

  for (const queueDoc of allDocs) {
    const entry = queueDoc.data()

    // For pending entries: check if scheduledAt is due
    if (entry.status === 'pending') {
      if (entry.scheduledAt > now) continue
    }

    // For processing entries: check if lock is stale (crashed worker)
    if (entry.status === 'processing') {
      if (entry.lockedAt) {
        const lockAge = now.seconds - entry.lockedAt.seconds
        if (lockAge < STALE_LOCK_SECONDS) {
          // Lock is still fresh — another worker is handling it
          result.skipped++
          continue
        }
        // Stale lock — reclaim it
      }
    }

    // 3. Attempt to acquire lock via optimistic update
    const lockRef = adminDb.collection('social_queue').doc(queueDoc.id)

    try {
      const locked = await adminDb.runTransaction(async (txn) => {
        const freshDoc = await txn.get(lockRef)
        if (!freshDoc.exists) return false

        const freshData = freshDoc.data()!
        // Only lock if still pending, or processing with stale lock
        if (freshData.status === 'pending' || (freshData.status === 'processing' && freshData.lockedAt && (now.seconds - freshData.lockedAt.seconds) >= STALE_LOCK_SECONDS)) {
          txn.update(lockRef, {
            status: 'processing',
            lockedBy: instanceId,
            lockedAt: now,
            startedAt: freshData.startedAt ?? now,
          })
          return true
        }
        return false
      })

      if (!locked) {
        result.skipped++
        continue
      }
    } catch {
      // Transaction conflict — another instance grabbed it
      result.skipped++
      continue
    }

    // 4. Fetch the associated post
    const postDoc = await adminDb.collection('social_posts').doc(entry.postId).get()
    if (!postDoc.exists) {
      await lockRef.update({
        status: 'failed',
        error: 'Post not found',
        lockedBy: null,
        lockedAt: null,
        completedAt: FieldValue.serverTimestamp(),
      })
      result.failed++
      result.errors.push({ postId: entry.postId, error: 'Post not found' })
      continue
    }

    const post = postDoc.data()!

    // Skip if post is already published/cancelled
    if (post.status === 'published' || post.status === 'cancelled') {
      await lockRef.update({
        status: post.status === 'published' ? 'completed' : 'cancelled',
        lockedBy: null,
        lockedAt: null,
        completedAt: FieldValue.serverTimestamp(),
      })
      result.skipped++
      continue
    }

    // 5. Resolve platform and content
    const platformType = toPlatformType(post.platform)
    if (!platformType) {
      await failQueueEntry(lockRef, entry, `Unsupported platform: ${post.platform}`)
      result.failed++
      result.errors.push({ postId: entry.postId, error: `Unsupported platform: ${post.platform}` })
      continue
    }

    const text = typeof post.content === 'string' ? post.content : post.content?.text
    if (!text) {
      await failQueueEntry(lockRef, entry, 'Post has no content')
      result.failed++
      result.errors.push({ postId: entry.postId, error: 'Post has no content' })
      continue
    }

    // 6. Publish via provider
    try {
      const provider = getDefaultProvider(platformType)
      let externalId: string

      const threadParts: string[] | undefined = post.threadParts
      if (Array.isArray(threadParts) && threadParts.length > 0) {
        const results = await provider.publishThread(threadParts)
        externalId = results[0].platformPostId
      } else {
        const publishResult = await provider.publishPost({ text })
        externalId = publishResult.platformPostId
      }

      // Success — update post and queue entry
      await adminDb.collection('social_posts').doc(entry.postId).update({
        status: 'published',
        publishedAt: FieldValue.serverTimestamp(),
        externalId,
        error: null,
        updatedAt: FieldValue.serverTimestamp(),
      })

      await lockRef.update({
        status: 'completed',
        lockedBy: null,
        lockedAt: null,
        completedAt: FieldValue.serverTimestamp(),
        error: null,
      })

      result.processed++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const attempts = (entry.attempts ?? 0) + 1
      const maxAttempts = entry.maxAttempts ?? 5

      if (attempts >= maxAttempts) {
        // Exhausted retries — mark as permanently failed
        await adminDb.collection('social_posts').doc(entry.postId).update({
          status: 'failed',
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        })

        await lockRef.update({
          status: 'failed',
          lockedBy: null,
          lockedAt: null,
          completedAt: FieldValue.serverTimestamp(),
          attempts,
          lastAttemptAt: FieldValue.serverTimestamp(),
          error: message,
        })
      } else {
        // Schedule retry with exponential backoff
        const backoffSeconds = getBackoffSeconds(attempts - 1)
        const nextRetryAt = Timestamp.fromMillis(Date.now() + backoffSeconds * 1000)

        await lockRef.update({
          status: 'pending',
          lockedBy: null,
          lockedAt: null,
          attempts,
          lastAttemptAt: FieldValue.serverTimestamp(),
          nextRetryAt,
          backoffSeconds,
          scheduledAt: nextRetryAt,
          error: message,
        })
      }

      result.failed++
      result.errors.push({ postId: entry.postId, error: message })
    }
  }

  return result
}

/** Mark a queue entry as failed and update the post */
async function failQueueEntry(
  lockRef: FirebaseFirestore.DocumentReference,
  entry: FirebaseFirestore.DocumentData,
  error: string,
): Promise<void> {
  const attempts = (entry.attempts ?? 0) + 1
  const maxAttempts = entry.maxAttempts ?? 5

  if (attempts >= maxAttempts) {
    await adminDb.collection('social_posts').doc(entry.postId).update({
      status: 'failed',
      error,
      updatedAt: FieldValue.serverTimestamp(),
    })

    await lockRef.update({
      status: 'failed',
      lockedBy: null,
      lockedAt: null,
      completedAt: FieldValue.serverTimestamp(),
      attempts,
      error,
    })
  } else {
    const backoffSeconds = getBackoffSeconds(attempts - 1)
    const nextRetryAt = Timestamp.fromMillis(Date.now() + backoffSeconds * 1000)

    await lockRef.update({
      status: 'pending',
      lockedBy: null,
      lockedAt: null,
      attempts,
      lastAttemptAt: FieldValue.serverTimestamp(),
      nextRetryAt,
      backoffSeconds,
      scheduledAt: nextRetryAt,
      error,
    })
  }
}
