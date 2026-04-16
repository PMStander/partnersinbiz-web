import type { Timestamp } from 'firebase-admin/firestore'

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'
export type Currency = 'USD' | 'EUR' | 'ZAR'

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface InvoiceAddress {
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export interface InvoiceBankingDetails {
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode?: string
  swiftCode?: string
  iban?: string
}

/** Snapshot of the sender's details at invoice creation time */
export interface InvoiceFromDetails {
  companyName: string
  address?: InvoiceAddress
  email?: string
  phone?: string
  vatNumber?: string
  registrationNumber?: string
  website?: string
  logoUrl?: string
  bankingDetails?: InvoiceBankingDetails
}

/** Snapshot of the client's details at invoice creation time */
export interface InvoiceClientDetails {
  name: string
  address?: InvoiceAddress
  email?: string
  phone?: string
  vatNumber?: string
}

export interface Invoice {
  id?: string
  orgId: string
  invoiceNumber: string
  status: InvoiceStatus
  issueDate: Timestamp | null
  dueDate: Timestamp | null
  lineItems: LineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currency: Currency
  notes: string
  paidAt: Timestamp | null
  sentAt: Timestamp | null
  createdBy: string
  /** Snapshot of sender details — frozen at creation */
  fromDetails?: InvoiceFromDetails
  /** Snapshot of client details — frozen at creation */
  clientDetails?: InvoiceClientDetails
  createdAt?: unknown
  updatedAt?: unknown
}

export type InvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>
