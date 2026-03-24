// lib/email/types.ts
import type { Timestamp } from 'firebase-admin/firestore'

export type EmailDirection = 'outbound' | 'inbound'

export type EmailStatus =
  | 'draft'
  | 'scheduled'
  | 'sent'
  | 'failed'
  | 'opened'
  | 'clicked'

export interface Email {
  id: string
  direction: EmailDirection
  contactId: string        // "" if none linked
  resendId: string         // Resend email ID — populated after send, used for webhook lookup
  from: string
  to: string
  cc: string[]
  subject: string
  bodyHtml: string
  bodyText: string
  status: EmailStatus
  scheduledFor: Timestamp | null
  sentAt: Timestamp | null
  openedAt: Timestamp | null
  clickedAt: Timestamp | null
  sequenceId: string       // "" if not part of a sequence
  sequenceStep: number | null
  createdAt: Timestamp | null
  deleted?: boolean
}

export type EmailInput = Omit<Email, 'id' | 'createdAt' | 'resendId'>

export interface EmailListParams {
  direction?: EmailDirection
  status?: EmailStatus
  contactId?: string
  limit?: number
  page?: number
}
