import { Timestamp } from 'firebase-admin/firestore'

export type SocialPlatform = 'x' | 'linkedin'
export type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
export type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

export interface SocialPost {
  id?: string
  platform: SocialPlatform
  content: string
  threadParts: string[]       // for X threads; empty for single tweets
  scheduledFor: Timestamp
  status: SocialPostStatus
  publishedAt: Timestamp | null
  externalId: string | null   // tweet ID or LinkedIn post URN
  error: string | null
  category: SocialPostCategory
  tags: string[]
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** A SocialPost that has been persisted — id is always present */
export type SocialPostDocument = SocialPost & { id: string }

export interface SocialPostInput {
  platform: SocialPlatform
  content: string
  /** ISO 8601 date-time string — must be a valid date, validated before conversion to Timestamp */
  scheduledFor: string        // ISO date string from API caller
  threadParts?: string[]
  category?: SocialPostCategory
  tags?: string[]
}
