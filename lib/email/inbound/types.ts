// lib/email/inbound/types.ts
//
// Inbound email types — received via Resend Routes that forward parsed
// messages to /api/v1/email/inbound-webhook.
//
// Storage: Firestore `inbound_emails` collection. One doc per delivered
// inbound message. `processed: false` until processInboundEmail() runs the
// routing logic and sets `processed: true` (and `processedAt`).

import type { Timestamp } from 'firebase-admin/firestore'

/**
 * Classification of an inbound email. Drives routing:
 *   reply             → auto-pause active sequence enrollments, log activity
 *   auto-reply        → log only (don't pause; the contact will reply later)
 *   bounce-reply      → add soft-bounce suppression, log activity
 *   unsubscribe-reply → mark contact unsubscribedAt, pause enrollments, log
 *   unknown           → log; manual review
 */
export type ReplyIntent =
  | 'reply'
  | 'auto-reply'
  | 'bounce-reply'
  | 'unsubscribe-reply'
  | 'unknown'

export interface InboundAttachment {
  name: string
  contentType: string
  sizeBytes: number
  url?: string
}

export interface InboundEmail {
  id: string
  orgId: string
  fromEmail: string             // sender (the contact)
  fromName: string
  toEmail: string               // the recipient (our sending address)
  replyToEmailId: string        // matched outbound emails doc id, "" if no match
  contactId: string             // matched contact, "" if no match
  campaignId: string
  sequenceId: string
  broadcastId: string
  subject: string
  bodyText: string              // plain text version
  bodyHtml: string
  rawHeaders: Record<string, string>
  intent: ReplyIntent           // classified
  inReplyTo: string             // RFC Message-ID this is in reply to
  references: string[]          // chain
  attachments: InboundAttachment[]
  receivedAt: Timestamp | null
  processedAt: Timestamp | null // null until we've routed it
  processed: boolean
  createdAt: Timestamp | null
  deleted?: boolean
}

export type InboundEmailInput = Omit<InboundEmail, 'id' | 'createdAt' | 'processedAt'>

export interface InboundListParams {
  orgId?: string
  processed?: boolean
  intent?: ReplyIntent
  contactId?: string
  sequenceId?: string
  limit?: number
}
