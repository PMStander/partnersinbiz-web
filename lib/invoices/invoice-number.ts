// lib/invoices/invoice-number.ts
import { adminDb } from '@/lib/firebase/admin'

/**
 * Generate a client-prefixed invoice number using an atomic Firestore transaction.
 * Format: CLI-001 (first 3 letters of client name, uppercase, then sequential number)
 * Example: "Lumen Digital" → LUM-001, LUM-002, etc.
 *
 * Uses a counter document at organizations/{orgId}/counters/invoices to prevent
 * duplicate numbers under concurrent requests (duplicate + cron firing simultaneously).
 */
export async function generateInvoiceNumber(orgId: string, clientName: string): Promise<string> {
  // Build prefix from first 3 letters of client name (uppercase, alpha only)
  const alphaOnly = clientName.replace(/[^a-zA-Z]/g, '')
  const prefix = (alphaOnly.length >= 3 ? alphaOnly.slice(0, 3) : alphaOnly.padEnd(3, 'X')).toUpperCase()

  const counterRef = adminDb
    .collection('organizations')
    .doc(orgId)
    .collection('counters')
    .doc('invoices')

  const count = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const next = snap.exists ? (snap.data()!.count as number) + 1 : 1
    tx.set(counterRef, { count: next }, { merge: true })
    return next
  })

  return `${prefix}-${String(count).padStart(3, '0')}`
}

/**
 * Preview what the next invoice number would be (for UI display).
 * Reads the current counter without incrementing — safe to call without side effects.
 */
export async function previewNextInvoiceNumber(orgId: string, clientName: string): Promise<string> {
  const alphaOnly = clientName.replace(/[^a-zA-Z]/g, '')
  const prefix = (alphaOnly.length >= 3 ? alphaOnly.slice(0, 3) : alphaOnly.padEnd(3, 'X')).toUpperCase()

  const counterRef = adminDb
    .collection('organizations')
    .doc(orgId)
    .collection('counters')
    .doc('invoices')

  const snap = await counterRef.get()
  const next = snap.exists ? (snap.data()!.count as number) + 1 : 1

  return `${prefix}-${String(next).padStart(3, '0')}`
}
