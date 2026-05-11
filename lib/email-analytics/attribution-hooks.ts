// lib/email-analytics/attribution-hooks.ts
//
// Best-effort, fire-and-forget wrappers around `recordAttribution`. Used by
// the deal-won and invoice-paid routes so a conversion event tries to
// attribute revenue back to the most recent email click for the contact.
//
// All wrappers swallow errors — attribution is a nice-to-have analytics
// signal and must never break the conversion event itself.

import { recordAttribution } from './attribution'

interface AttemptDealAttributionInput {
  orgId: string | null | undefined
  contactId: string | null | undefined
  dealId: string
  amount: number | null | undefined
  currency?: string | null | undefined
  conversionAt?: Date
}

/**
 * Try to attribute a won deal back to the most recent email click in the
 * 30-day window. No-op if `orgId`/`contactId` is missing or attribution
 * already exists (idempotent on the storage layer).
 */
export async function tryAttributeDealWon(
  input: AttemptDealAttributionInput,
): Promise<void> {
  if (!input.orgId || !input.contactId) return
  try {
    await recordAttribution({
      orgId: input.orgId,
      contactId: input.contactId,
      conversionId: input.dealId,
      conversionType: 'deal',
      amount: typeof input.amount === 'number' ? input.amount : 0,
      currency: (input.currency || 'ZAR').toUpperCase(),
      conversionAt: input.conversionAt ?? new Date(),
    })
  } catch (err) {
    console.error('[attribution-deal-won-error]', input.dealId, err)
  }
}

interface AttemptInvoiceAttributionInput {
  orgId: string | null | undefined
  contactId: string | null | undefined
  invoiceId: string
  amount: number | null | undefined
  currency?: string | null | undefined
  conversionAt?: Date
}

/**
 * Try to attribute a paid invoice back to the most recent email click in the
 * 30-day window. No-op if `orgId`/`contactId` is missing. Idempotent.
 */
export async function tryAttributeInvoicePaid(
  input: AttemptInvoiceAttributionInput,
): Promise<void> {
  if (!input.orgId || !input.contactId) return
  try {
    await recordAttribution({
      orgId: input.orgId,
      contactId: input.contactId,
      conversionId: input.invoiceId,
      conversionType: 'order',
      amount: typeof input.amount === 'number' ? input.amount : 0,
      currency: (input.currency || 'ZAR').toUpperCase(),
      conversionAt: input.conversionAt ?? new Date(),
    })
  } catch (err) {
    console.error('[attribution-invoice-paid-error]', input.invoiceId, err)
  }
}
