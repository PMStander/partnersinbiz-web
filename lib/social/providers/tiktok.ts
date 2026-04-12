/**
 * TikTok Provider — OAuth 2.0 Bearer token implementation.
 *
 * Supports video publishing via "pull from URL" approach and profile retrieval.
 * Publishing is a multi-step process on TikTok; this provider uses the
 * simplified video init endpoint with a pull URL.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo } from './types'

const TIKTOK_BASE_URL = 'https://open.tiktokapis.com/v2'
const TIKTOK_PUBLISH_URL = `${TIKTOK_BASE_URL}/post/publish/video/init/`
const TIKTOK_USER_INFO_URL = `${TIKTOK_BASE_URL}/user/info/`
const TIKTOK_TOKEN_URL = `${TIKTOK_BASE_URL}/oauth/token/`

export class TikTokProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('tiktok', credentials)
    if (!credentials.accessToken) throw new Error('TikTokProvider requires accessToken')
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): TikTokProvider {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN
    const apiKey = process.env.TIKTOK_CLIENT_KEY
    const apiKeySecret = process.env.TIKTOK_CLIENT_SECRET
    const refreshToken = process.env.TIKTOK_REFRESH_TOKEN
    if (!accessToken) throw new Error('Missing env var: TIKTOK_ACCESS_TOKEN')
    return new TikTokProvider({ accessToken, apiKey, apiKeySecret, refreshToken })
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      throw new Error('TikTok requires a video to publish')
    }

    const body = JSON.stringify({
      post_info: {
        title: options.text,
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: options.mediaUrls[0],
      },
    })

    const response = await fetch(TIKTOK_PUBLISH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`TikTok API error ${response.status}: ${text}`)
    }

    const json = await response.json() as { data: { publish_id: string } }
    if (!json?.data?.publish_id) throw new Error('TikTok API returned unexpected response: ' + JSON.stringify(json))

    return {
      platformPostId: json.data.publish_id,
      platformPostUrl: '',
    }
  }

  async deletePost(_platformPostId: string): Promise<void> {
    throw new Error('TikTok does not support post deletion via API')
  }

  async getProfile(): Promise<ProfileInfo> {
    const url = `${TIKTOK_USER_INFO_URL}?fields=open_id,display_name,avatar_url,follower_count,following_count`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`TikTok API error ${response.status}: ${text}`)
    }

    const json = await response.json() as {
      data: {
        user: {
          open_id: string
          display_name: string
          avatar_url: string
          follower_count: number
          following_count: number
        }
      }
    }
    const u = json.data.user

    return {
      platformAccountId: u.open_id,
      displayName: u.display_name,
      username: u.display_name,
      avatarUrl: u.avatar_url ?? '',
      profileUrl: '',
      accountType: 'personal',
      followerCount: u.follower_count,
      followingCount: u.following_count,
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.getProfile()
      return true
    } catch {
      return false
    }
  }

  async refreshToken(): Promise<ProviderCredentials | null> {
    if (!this.credentials.refreshToken) return null
    if (!this.credentials.apiKey || !this.credentials.apiKeySecret) return null

    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_key: this.credentials.apiKey,
        client_secret: this.credentials.apiKeySecret,
        grant_type: 'refresh_token',
        refresh_token: this.credentials.refreshToken,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`TikTok token refresh error ${response.status}: ${text}`)
    }

    const json = await response.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      apiKey: this.credentials.apiKey,
      apiKeySecret: this.credentials.apiKeySecret,
    }
  }
}
