/**
 * Social module types — re-exports from providers/types.ts (canonical)
 * plus legacy types for backward compatibility with existing UI/cron.
 */
import { Timestamp } from 'firebase-admin/firestore'

// Re-export all canonical types from providers
export type {
  SocialPlatformType,
  AccountType,
  AccountStatus,
  SocialAccount,
  EncryptedTokenBlock,
  PostStatus,
  PostSource,
  PlatformOverride,
  PostMediaAttachment,
  PlatformResult,
  PostComment,
  EnhancedSocialPost,
  MediaType,
  MediaStatus,
  SocialMedia,
  MediaVariant,
  QueueStatus,
  QueueEntry,
  AuditAction,
  AuditEntityType,
  AuditLogEntry,
  PublishResult,
  ProfileInfo,
  AnalyticsData,
  MediaConstraint,
  PlatformConstraints,
  ValidationError,
  ValidationResult,
} from './providers/types'

export { ACTIVE_PLATFORMS } from './providers/types'

// ---------------------------------------------------------------------------
// Legacy types (kept for existing social_posts collection, cron, and admin UI)
// ---------------------------------------------------------------------------

export type SocialPlatform = 'x' | 'linkedin'
export type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
export type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

export interface SocialPost {
  id?: string
  platform: SocialPlatform
  content: string
  threadParts: string[]
  scheduledFor: Timestamp
  status: SocialPostStatus
  publishedAt: Timestamp | null
  externalId: string | null
  error: string | null
  category: SocialPostCategory
  tags: string[]
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type SocialPostDocument = SocialPost & { id: string }

export interface SocialPostInput {
  platform: SocialPlatform
  content: string
  scheduledFor: string
  threadParts?: string[]
  category?: SocialPostCategory
  tags?: string[]
}
