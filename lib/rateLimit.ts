import { adminDb } from '@/lib/firebase/admin'

export interface RateLimitInput {
  key: string         // e.g. 'code:1.2.3.4' or 'magic_link:a@b.com'
  limit: number       // max requests in window
  windowMs: number    // window length
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export async function checkAndIncrementRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const ref = adminDb.collection('rate_limits').doc(input.key)
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const now = Date.now()

    if (!snap.exists) {
      const resetAt = now + input.windowMs
      tx.set(ref, { count: 1, resetAt })
      return { allowed: true, remaining: input.limit - 1, resetAt: new Date(resetAt) }
    }

    const data = snap.data() as { count: number; resetAt: number }
    if (data.resetAt < now) {
      const resetAt = now + input.windowMs
      tx.set(ref, { count: 1, resetAt })
      return { allowed: true, remaining: input.limit - 1, resetAt: new Date(resetAt) }
    }

    if (data.count >= input.limit) {
      return { allowed: false, remaining: 0, resetAt: new Date(data.resetAt) }
    }

    tx.update(ref, { count: data.count + 1 })
    return { allowed: true, remaining: input.limit - data.count - 1, resetAt: new Date(data.resetAt) }
  })
}
