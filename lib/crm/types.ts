// lib/crm/types.ts
import type { Timestamp } from 'firebase-admin/firestore'

// ── Contacts ────────────────────────────────────────────────────────────────

export type ContactSource = 'manual' | 'form' | 'import' | 'outreach'
export type ContactType = 'lead' | 'prospect' | 'client' | 'churned'
export type ContactStage =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'demo'
  | 'proposal'
  | 'won'
  | 'lost'

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  website: string
  source: ContactSource
  type: ContactType
  stage: ContactStage
  tags: string[]
  notes: string
  assignedTo: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  lastContactedAt: Timestamp | null
  deleted?: boolean
}

export type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>

// ── Deals ────────────────────────────────────────────────────────────────────

export type DealStage =
  | 'discovery'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'

export type Currency = 'USD' | 'EUR' | 'ZAR'

export interface Deal {
  id: string
  contactId: string
  title: string
  value: number
  currency: Currency
  stage: DealStage
  expectedCloseDate: Timestamp | null
  notes: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  deleted?: boolean
}

export type DealInput = Omit<Deal, 'id' | 'createdAt' | 'updatedAt'>

// ── Activities ───────────────────────────────────────────────────────────────

export type ActivityType =
  | 'email_sent'
  | 'email_received'
  | 'call'
  | 'note'
  | 'stage_change'
  | 'sequence_enrolled'
  | 'sequence_completed'

export interface Activity {
  id: string
  contactId: string
  dealId: string
  type: ActivityType
  summary: string
  metadata: Record<string, unknown>
  createdAt: Timestamp | null
  createdBy: string
}

export type ActivityInput = Omit<Activity, 'id' | 'createdAt'>

// ── API list params ──────────────────────────────────────────────────────────

export interface ContactListParams {
  stage?: ContactStage
  type?: ContactType
  source?: ContactSource
  search?: string
  limit?: number
  page?: number
}

export interface DealListParams {
  stage?: DealStage
  contactId?: string
  limit?: number
  page?: number
}
