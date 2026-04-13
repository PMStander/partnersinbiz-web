/**
 * Provider Registry — Factory for instantiating social platform providers.
 *
 * Use `getProvider()` to get a provider instance by platform type.
 * For the default (env-based) accounts, use `getDefaultProvider()`.
 */
import type { SocialPlatformType } from './types'
import type { ProviderCredentials } from './base'
import { SocialProvider } from './base'
import { TwitterProvider } from './twitter'
import { LinkedInProvider } from './linkedin'
import { FacebookProvider } from './facebook'
import { InstagramProvider } from './instagram'
import { RedditProvider } from './reddit'
import { TikTokProvider } from './tiktok'
import { PinterestProvider } from './pinterest'
import { BlueskyProvider } from './bluesky'
import { ThreadsProvider } from './threads'
import { YouTubeProvider } from './youtube'
import { MastodonProvider } from './mastodon'
import { DribbbleProvider } from './dribbble'

type ProviderConstructor = new (credentials: ProviderCredentials) => SocialProvider

/** Registry of provider constructors by platform type */
const PROVIDER_MAP: Partial<Record<SocialPlatformType, ProviderConstructor>> = {
  twitter: TwitterProvider,
  linkedin: LinkedInProvider,
  facebook: FacebookProvider,
  instagram: InstagramProvider,
  reddit: RedditProvider,
  tiktok: TikTokProvider,
  pinterest: PinterestProvider,
  bluesky: BlueskyProvider,
  threads: ThreadsProvider,
  youtube: YouTubeProvider,
  mastodon: MastodonProvider,
  dribbble: DribbbleProvider,
}

/**
 * Get a provider instance for a platform using the given credentials.
 * Throws if the platform is not supported.
 */
export function getProvider(platform: SocialPlatformType, credentials: ProviderCredentials): SocialProvider {
  const Constructor = PROVIDER_MAP[platform]
  if (!Constructor) {
    throw new Error(`No provider implementation for platform: ${platform}`)
  }
  return new Constructor(credentials)
}

/**
 * Get a provider instance using environment variable credentials.
 * Used for the default admin account (legacy single-account mode).
 */
export function getDefaultProvider(platform: SocialPlatformType): SocialProvider {
  switch (platform) {
    case 'twitter':
      return TwitterProvider.fromEnv()
    case 'linkedin':
      return LinkedInProvider.fromEnv()
    case 'facebook':
      return FacebookProvider.fromEnv()
    case 'instagram':
      return InstagramProvider.fromEnv()
    case 'reddit':
      return RedditProvider.fromEnv()
    case 'tiktok':
      return TikTokProvider.fromEnv()
    case 'pinterest':
      return PinterestProvider.fromEnv()
    case 'bluesky':
      return BlueskyProvider.fromEnv()
    case 'threads':
      return ThreadsProvider.fromEnv()
    case 'youtube':
      return YouTubeProvider.fromEnv()
    case 'mastodon':
      return MastodonProvider.fromEnv()
    case 'dribbble':
      return DribbbleProvider.fromEnv()
    default:
      throw new Error(`No default provider for platform: ${platform}. Connect an account via OAuth.`)
  }
}

/** List all platforms that have provider implementations */
export function getSupportedPlatforms(): SocialPlatformType[] {
  return Object.keys(PROVIDER_MAP) as SocialPlatformType[]
}

/** Check if a platform has a provider implementation */
export function isProviderAvailable(platform: SocialPlatformType): boolean {
  return platform in PROVIDER_MAP
}
