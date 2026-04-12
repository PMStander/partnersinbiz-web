/**
 * Social Media Providers — Public API
 *
 * Clean re-exports for consuming code.
 */

// Base class & interfaces
export { SocialProvider } from './base'
export type { ProviderCredentials, PublishOptions } from './base'

// Platform providers
export { TwitterProvider } from './twitter'
export { LinkedInProvider } from './linkedin'
export { FacebookProvider } from './facebook'
export { InstagramProvider } from './instagram'
export { RedditProvider } from './reddit'
export { TikTokProvider } from './tiktok'
export { PinterestProvider } from './pinterest'
export { BlueskyProvider } from './bluesky'
export { ThreadsProvider } from './threads'

// Registry
export {
  getProvider,
  getDefaultProvider,
  getSupportedPlatforms,
  isProviderAvailable,
} from './registry'

// Constraints
export {
  getConstraints,
  getAllConstraints,
  isPlatformActive,
} from './constraints'

// Types — re-export everything
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
} from './types'

export { ACTIVE_PLATFORMS } from './types'
