// lib/invoices/invoice-number.ts
import { adminDb } from '@/lib/firebase/admin'

/**
 * Generate a client-prefixed invoice number.
 * Format: CLI-001 (first 3 letters of client name, uppercase, then sequential number)
 * Example: "Lumen Digital" → LUM-001, LUM-002, etc.
 */
export async function generateInvoiceNumber(orgId: string, clientName: string): Promise<string> {
  // Build prefix from first 3 letters of client name (uppercase, alpha only)
  const alphaOnly = clientName.replace(/[^a-zA-Z]/g, '')
  const prefix = (alphaOnly.length >= 3 ? alphaOnly.slice(0, 3) : alphaOnly.padEnd(3, 'X')).toUpperCase()

  // Count existing invoices for this org to determine next number
  const snapshot = await adminDb
    .collection('invoices')
    .where('orgId', '==', orgId)
    .get()

  const count = snapshot.size + 1
  const number = String(count).padStart(3, '0')

  return `${prefix}-${number}`
}

/**
 * Preview what the next invoice number would be (for UI display).
 */
export async function previewNextInvoiceNumber(orgId: string, clientName: string): Promise<string> {
  return generateInvoiceNumber(orgId, clientName)
}
