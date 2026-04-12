/**
 * Platform Constraints — Character limits, media specs, and capabilities per platform.
 *
 * These are used by the validation service to check post content before scheduling.
 */
import type { PlatformConstraints, SocialPlatformType } from './types'

const TWITTER_CONSTRAINTS: PlatformConstraints = {
  platform: 'twitter',
  maxTextLength: 280,
  maxHashtags: null, // no hard limit but impacts reach
  maxMediaPerPost: 4,
  supportsThreads: true,
  supportsVideo: true,
  supportsCarousel: false,
  supportsAltText: true,
  maxThreadParts: 25,
  maxThreadPartLength: 280,
  linkCountsAgainstLimit: true,
  linkReservedChars: 23, // t.co wraps all links to 23 chars
  image: {
    maxSizeMB: 5,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxWidth: 4096,
    maxHeight: 4096,
    minWidth: 2,
    minHeight: 2,
  },
  video: {
    maxSizeMB: 512,
    allowedTypes: ['video/mp4'],
    maxWidth: 1920,
    maxHeight: 1200,
    maxDurationSeconds: 140,
  },
}

const LINKEDIN_CONSTRAINTS: PlatformConstraints = {
  platform: 'linkedin',
  maxTextLength: 3000,
  maxHashtags: 30,
  maxMediaPerPost: 20,
  supportsThreads: false,
  supportsVideo: true,
  supportsCarousel: true,
  supportsAltText: true,
  maxThreadParts: null,
  maxThreadPartLength: null,
  linkCountsAgainstLimit: false,
  linkReservedChars: 0,
  image: {
    maxSizeMB: 10,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
    maxWidth: 4096,
    maxHeight: 4096,
  },
  video: {
    maxSizeMB: 200,
    allowedTypes: ['video/mp4', 'video/quicktime'],
    maxDurationSeconds: 600,
  },
}

/** Map of all platform constraints. Add new platforms here as they are implemented. */
const PLATFORM_CONSTRAINTS: Record<SocialPlatformType, PlatformConstraints> = {
  twitter: TWITTER_CONSTRAINTS,
  linkedin: LINKEDIN_CONSTRAINTS,
  // Stub constraints for future platforms — will be fleshed out when implemented
  instagram: { platform: 'instagram', maxTextLength: 2200, maxHashtags: 30, maxMediaPerPost: 10, supportsThreads: false, supportsVideo: true, supportsCarousel: true, supportsAltText: true, maxThreadParts: null, maxThreadPartLength: null, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 8, allowedTypes: ['image/jpeg', 'image/png'] }, video: { maxSizeMB: 100, allowedTypes: ['video/mp4'], maxDurationSeconds: 60 } },
  facebook: { platform: 'facebook', maxTextLength: 63206, maxHashtags: null, maxMediaPerPost: 10, supportsThreads: false, supportsVideo: true, supportsCarousel: true, supportsAltText: true, maxThreadParts: null, maxThreadPartLength: null, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 10, allowedTypes: ['image/jpeg', 'image/png', 'image/gif'] }, video: { maxSizeMB: 1024, allowedTypes: ['video/mp4'], maxDurationSeconds: 14400 } },
  tiktok: { platform: 'tiktok', maxTextLength: 2200, maxHashtags: null, maxMediaPerPost: 1, supportsThreads: false, supportsVideo: true, supportsCarousel: false, supportsAltText: false, maxThreadParts: null, maxThreadPartLength: null, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 0, allowedTypes: [] }, video: { maxSizeMB: 287, allowedTypes: ['video/mp4'], maxDurationSeconds: 600 } },
  pinterest: { platform: 'pinterest', maxTextLength: 500, maxHashtags: 20, maxMediaPerPost: 1, supportsThreads: false, supportsVideo: true, supportsCarousel: true, supportsAltText: true, maxThreadParts: null, maxThreadPartLength: null, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 20, allowedTypes: ['image/jpeg', 'image/png'], aspectRatios: ['2:3', '1:1'] }, video: { maxSizeMB: 2048, allowedTypes: ['video/mp4'], maxDurationSeconds: 900 } },
  reddit: { platform: 'reddit', maxTextLength: 40000, maxHashtags: null, maxMediaPerPost: 20, supportsThreads: false, supportsVideo: true, supportsCarousel: true, supportsAltText: false, maxThreadParts: null, maxThreadPartLength: null, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 20, allowedTypes: ['image/jpeg', 'image/png', 'image/gif'] }, video: { maxSizeMB: 1024, allowedTypes: ['video/mp4'], maxDurationSeconds: 900 } },
  youtube: { platform: 'youtube', maxTextLength: 5000, maxHashtags: 15, maxMediaPerPost: 1, supportsThreads: false, supportsVideo: true, supportsCarousel: false, supportsAltText: false, maxThreadParts: null, maxThreadPartLength: null, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 2, allowedTypes: ['image/jpeg', 'image/png'] }, video: { maxSizeMB: 12288, allowedTypes: ['video/mp4', 'video/quicktime'], maxDurationSeconds: 43200 } },
  threads: { platform: 'threads', maxTextLength: 500, maxHashtags: null, maxMediaPerPost: 10, supportsThreads: true, supportsVideo: true, supportsCarousel: true, supportsAltText: true, maxThreadParts: 10, maxThreadPartLength: 500, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 8, allowedTypes: ['image/jpeg', 'image/png'] }, video: { maxSizeMB: 100, allowedTypes: ['video/mp4'], maxDurationSeconds: 300 } },
  bluesky: { platform: 'bluesky', maxTextLength: 300, maxHashtags: null, maxMediaPerPost: 4, supportsThreads: true, supportsVideo: true, supportsCarousel: false, supportsAltText: true, maxThreadParts: null, maxThreadPartLength: 300, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 1, allowedTypes: ['image/jpeg', 'image/png'] }, video: { maxSizeMB: 50, allowedTypes: ['video/mp4'], maxDurationSeconds: 60 } },
  mastodon: { platform: 'mastodon', maxTextLength: 500, maxHashtags: null, maxMediaPerPost: 4, supportsThreads: true, supportsVideo: true, supportsCarousel: false, supportsAltText: true, maxThreadParts: null, maxThreadPartLength: 500, linkCountsAgainstLimit: false, linkReservedChars: 23, image: { maxSizeMB: 16, allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] }, video: { maxSizeMB: 99, allowedTypes: ['video/mp4', 'video/webm'], maxDurationSeconds: 300 } },
  dribbble: { platform: 'dribbble', maxTextLength: 500, maxHashtags: 20, maxMediaPerPost: 1, supportsThreads: false, supportsVideo: true, supportsCarousel: false, supportsAltText: true, maxThreadParts: null, maxThreadPartLength: null, linkCountsAgainstLimit: false, linkReservedChars: 0, image: { maxSizeMB: 10, allowedTypes: ['image/jpeg', 'image/png', 'image/gif'] }, video: null },
}

/** Get constraints for a specific platform */
export function getConstraints(platform: SocialPlatformType): PlatformConstraints {
  return PLATFORM_CONSTRAINTS[platform]
}

/** Get constraints for all platforms */
export function getAllConstraints(): Record<SocialPlatformType, PlatformConstraints> {
  return PLATFORM_CONSTRAINTS
}

/** Check if a platform is currently active (has a working provider) */
export function isPlatformActive(platform: SocialPlatformType): boolean {
  return (['twitter', 'linkedin'] as SocialPlatformType[]).includes(platform)
}
