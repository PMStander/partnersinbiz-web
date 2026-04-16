// lib/expenses/types.ts
// Types for the expenses module.

export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'reimbursed'
  | 'rejected'

export interface Expense {
  id: string
  orgId: string
  userId: string
  date: string // ISO (expense date, not submission date)
  amount: number
  currency: string
  category: string
  description: string
  vendor: string
  receiptFileId: string | null
  projectId: string | null
  clientOrgId: string | null
  billable: boolean
  reimbursable: boolean
  status: ExpenseStatus
  invoiceId: string | null // when billed to client
  reviewedBy: string | null
  reviewedAt: unknown | null
  rejectionReason: string | null
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  createdAt: unknown
  updatedAt: unknown
  deleted: boolean
}

export interface ExpenseInput {
  userId?: string
  date: string
  amount: number
  currency?: string
  category: string
  description?: string
  vendor?: string
  receiptFileId?: string
  projectId?: string
  clientOrgId?: string
  billable?: boolean
  reimbursable?: boolean
}

export const VALID_EXPENSE_STATUSES: ExpenseStatus[] = [
  'draft',
  'submitted',
  'approved',
  'reimbursed',
  'rejected',
]

// Statuses at which the record is still editable / deletable.
export const EDITABLE_EXPENSE_STATUSES: ExpenseStatus[] = ['draft', 'submitted']
