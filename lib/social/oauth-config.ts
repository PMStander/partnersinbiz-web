/**
 * OAuth Configuration — Per-platform OAuth URLs, scopes, and token exchange logic.
 */
import type { SocialPlatformType } from './providers/types'

export interface OAuthConfig {
  platform: SocialPlatformType
  authUrl: string
  tokenUrl: string
  scopes: string[]
  /** Whether to use Basic auth for token exchange (Reddit, Pinterest) */
  useBasicAuth?: boolean
  /** Extra params for the auth URL */
  extraAuthParams?: Record<string, string>
}

function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function getCallbackUrl(platform: SocialPlatformType): string {
  return `${getAppUrl()}/api/v1/social/oauth/${platform}/callback`
}

export function getOAuthConfig(platform: SocialPlatformType): OAuthConfig | null {
  switch (platform) {
    case 'facebook':
      return {
        platform: 'facebook',
        authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
        scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
      }
    case 'instagram':
      return {
        platform: 'instagram',
        authUrl: 'https://www.instagram.com/oauth/authorize',
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        scopes: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments'],
      }
    case 'linkedin':
      return {
        platform: 'linkedin',
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: ['w_member_social', 'w_organization_social', 'r_liteprofile', 'openid', 'profile'],
      }
    case 'reddit':
      return {
        platform: 'reddit',
        authUrl: 'https://www.reddit.com/api/v1/authorize',
        tokenUrl: 'https://www.reddit.com/api/v1/access_token',
        scopes: ['submit', 'identity', 'read'],
        useBasicAuth: true,
        extraAuthParams: { duration: 'permanent' },
      }
    case 'tiktok':
      return {
        platform: 'tiktok',
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: ['user.info.basic', 'video.upload', 'video.publish'],
      }
    case 'pinterest':
      return {
        platform: 'pinterest',
        authUrl: 'https://www.pinterest.com/oauth/',
        tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
        scopes: ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'],
        useBasicAuth: true,
      }
    case 'threads':
      return {
        platform: 'threads',
        authUrl: 'https://threads.net/oauth/authorize',
        tokenUrl: 'https://graph.threads.net/oauth/access_token',
        scopes: ['threads_basic', 'threads_content_publish', 'threads_manage_replies'],
      }
    case 'youtube':
      return {
        platform: 'youtube',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
          'https://www.googleapis.com/auth/youtube.force-ssl',
        ],
        extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      }
    case 'twitter':
      // Twitter uses OAuth 1.0a — handled separately
      return null
    case 'bluesky':
      // Bluesky uses app passwords — no OAuth
      return null
    case 'mastodon': {
      // Mastodon is instance-specific; use env var for default instance
      const instanceUrl = process.env.MASTODON_INSTANCE_URL || 'https://mastodon.social'
      return {
        platform: 'mastodon',
        authUrl: `${instanceUrl}/oauth/authorize`,
        tokenUrl: `${instanceUrl}/oauth/token`,
        scopes: ['read', 'write', 'follow'],
      }
    }
    case 'dribbble':
      return {
        platform: 'dribbble',
        authUrl: 'https://dribbble.com/oauth/authorize',
        tokenUrl: 'https://dribbble.com/oauth/token',
        scopes: ['public', 'upload'],
      }
    default:
      return null
  }
}

/**
 * Get the client credentials (client_id, client_secret) for a platform from env.
 */
export function getClientCredentials(platform: SocialPlatformType): { clientId: string; clientSecret: string } | null {
  // TikTok uses CLIENT_KEY naming convention instead of CLIENT_ID
  if (platform === 'tiktok') {
    const clientId = process.env.TIKTOK_CLIENT_KEY
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET
    if (!clientId || !clientSecret) return null
    return { clientId, clientSecret }
  }
  const prefix = platform.toUpperCase()
  const clientId = process.env[`${prefix}_CLIENT_ID`]
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}
