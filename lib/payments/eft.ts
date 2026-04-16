// lib/payments/eft.ts
/**
 * EFT payment instructions builder.
 *
 * SA-first: the platform owner org holds banking details at
 * `billingDetails.bankingDetails` (see `InvoiceFromDetails.bankingDetails`).
 * We map that into the neutral `BankingDetails` shape returned on the
 * public-view payload so the frontend doesn't need to know about the
 * internal Firestore structure.
 */
import type { BankingDetails, PaymentInstructions } from '@/lib/invoices/types'

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://partnersinbiz.online'

interface InvoiceLike {
  id?: string
  invoiceNumber: string
  total: number
  currency: string
  dueDate?: { toDate?: () => Date; _seconds?: number } | Date | null
  publicToken?: string
}

interface PlatformOrgLike {
  billingDetails?: {
    bankingDetails?: {
      bankName?: string
      accountHolder?: string
      accountName?: string
      accountNumber?: string
      branchCode?: string
      swiftCode?: string
      swift?: string
      iban?: string
    }
  }
  billingEmail?: string
  settings?: { notificationEmail?: string }
}

function formatDueDate(dueDate: InvoiceLike['dueDate']): string | null {
  if (!dueDate) return null
  try {
    if (dueDate instanceof Date) return dueDate.toISOString()
    if (typeof (dueDate as { toDate?: () => Date }).toDate === 'function') {
      return (dueDate as { toDate: () => Date }).toDate().toISOString()
    }
    const seconds = (dueDate as { _seconds?: number })._seconds
    if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString()
  } catch {
    // fall through
  }
  return null
}

function mapBankingDetails(raw: PlatformOrgLike['billingDetails'] extends infer T ? T : never): BankingDetails {
  const b = raw?.bankingDetails ?? {}
  return {
    bankName: b.bankName,
    accountName: b.accountHolder ?? b.accountName,
    accountNumber: b.accountNumber,
    branchCode: b.branchCode,
    swift: b.swiftCode ?? b.swift,
    iban: b.iban,
  }
}

/**
 * Build the `PaymentInstructions` payload for a given invoice + platform org.
 *
 * Caller is responsible for ensuring `invoice.publicToken` is set — this
 * helper does NOT mutate the invoice. The `/payment-instructions` route
 * generates a token first if missing.
 */
export function buildPaymentInstructions(
  invoice: InvoiceLike,
  platformOrg: PlatformOrgLike | null,
): PaymentInstructions {
  const bankingDetails = mapBankingDetails(platformOrg?.billingDetails)
  const proofOfPaymentEmail =
    platformOrg?.billingEmail ??
    platformOrg?.settings?.notificationEmail ??
    'billing@partnersinbiz.online'

  const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID)
  const paypalUrl =
    paypalConfigured && invoice.id
      ? `${PUBLIC_BASE_URL}/api/v1/invoices/${invoice.id}/paypal-order`
      : null

  const publicToken = invoice.publicToken ?? ''
  const publicViewUrl = `${PUBLIC_BASE_URL}/invoice/${publicToken}`

  return {
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
    currency: invoice.currency,
    dueDate: formatDueDate(invoice.dueDate ?? null),
    eft: {
      bankingDetails,
      reference: invoice.invoiceNumber,
      proofOfPaymentEmail,
    },
    paypal: {
      available: paypalConfigured,
      url: paypalUrl,
    },
    publicViewUrl,
  }
}
