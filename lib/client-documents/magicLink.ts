import { randomBytes } from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { MagicLink } from './types'

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000

export function generateMagicLinkToken(): string {
  return randomBytes(32).toString('hex')
}

export interface CreateMagicLinkInput {
  email: string
  redirectUrl?: string
  context?: MagicLink['context']
}

export async function createMagicLink(input: CreateMagicLinkInput): Promise<{ token: string; expiresAt: Date }> {
  const token = generateMagicLinkToken()
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS)
  await adminDb.collection('magic_links').doc(token).set({
    email: input.email.toLowerCase(),
    redirectUrl: input.redirectUrl ?? null,
    context: input.context ?? null,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  })
  return { token, expiresAt }
}

export interface VerifyMagicLinkResult {
  ok: boolean
  email?: string
  redirectUrl?: string
  context?: MagicLink['context']
  reason?: 'not_found' | 'expired' | 'used'
}

export async function consumeMagicLink(token: string): Promise<VerifyMagicLinkResult> {
  const ref = adminDb.collection('magic_links').doc(token)
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { ok: false, reason: 'not_found' as const }
    const data = snap.data() as Record<string, unknown> & {
      used?: boolean
      email?: string
      redirectUrl?: string | null
      context?: MagicLink['context'] | null
      expiresAt?: { toDate?: () => Date } | string | number | Date
    }
    if (data.used) return { ok: false, reason: 'used' as const }
    const rawExp = data.expiresAt
    const exp =
      rawExp && typeof (rawExp as { toDate?: () => Date }).toDate === 'function'
        ? (rawExp as { toDate: () => Date }).toDate()
        : new Date(rawExp as string | number | Date)
    if (exp.getTime() < Date.now()) return { ok: false, reason: 'expired' as const }
    tx.update(ref, { used: true, consumedAt: FieldValue.serverTimestamp() })
    return {
      ok: true,
      email: data.email,
      redirectUrl: data.redirectUrl ?? undefined,
      context: data.context ?? undefined,
    }
  })
}
