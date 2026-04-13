import type { Timestamp } from 'firebase-admin/firestore'

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'
export type Currency = 'USD' | 'EUR' | 'ZAR'

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
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
  createdAt?: unknown
  updatedAt?: unknown
}

export type InvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>
