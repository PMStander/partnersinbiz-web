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
  orgId: string            // required after Phase 1 backfill
  campaignId: string       // "" if not part of a campaign
  broadcastId: string      // "" if not part of a broadcast
  fromDomainId: string     // "" if sent from shared PIB domain
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
  bouncedAt: Timestamp | null
  sequenceId: string       // "" if not part of a sequence
  sequenceStep: number | null
  // A/B testing — when the parent broadcast or sequence step has an active
  // AbConfig, this is the variant id (e.g. "a", "b") that this particular
  // email was sent as. "" when no A/B testing applied. The webhook uses this
  // to attribute opens / clicks / bounces back to the correct variant.
  variantId: string
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
