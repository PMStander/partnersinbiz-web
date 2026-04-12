/**
 * Pinterest Provider — OAuth 2.0 Bearer token implementation.
 *
 * Uses Pinterest API v5 for pin creation, deletion, and profile retrieval.
 * Supports image pins with board targeting and token refresh.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo } from './types'

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5'
const PINTEREST_PINS_URL = `${PINTEREST_API_BASE}/pins`
const PINTEREST_USER_URL = `${PINTEREST_API_BASE}/user_account`
const PINTEREST_TOKEN_URL = `${PINTEREST_API_BASE}/oauth/token`

export class PinterestProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('pinterest', credentials)
    if (!credentials.accessToken) throw new Error('PinterestProvider requires accessToken')
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): PinterestProvider {
    const accessToken = process.env.PINTEREST_ACCESS_TOKEN
    const apiKey = process.env.PINTEREST_CLIENT_ID
    const apiKeySecret = process.env.PINTEREST_CLIENT_SECRET
    const refreshToken = process.env.PINTEREST_REFRESH_TOKEN
    const personUrn = process.env.PINTEREST_BOARD_ID
    if (!accessToken) throw new Error('Missing env var: PINTEREST_ACCESS_TOKEN')
    return new PinterestProvider({ accessToken, apiKey, apiKeySecret, refreshToken, personUrn })
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    if (!options.mediaUrls?.[0]) {
      throw new Error('Pinterest requires an image to create a pin')
    }

    const body = JSON.stringify({
      board_id: this.credentials.personUrn,
      title: options.title || '',
      description: options.text,
      media_source: {
        source_type: 'image_url',
        url: options.mediaUrls[0],
      },
      alt_text: options.altTexts?.[0] || '',
    })

    const response = await fetch(PINTEREST_PINS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Pinterest API error ${response.status}: ${text}`)
    }

    const json = await response.json() as {
      id: string
      media?: { images?: { '600x'?: { url?: string } } }
    }
    if (!json?.id) throw new Error('Pinterest API returned unexpected response: ' + JSON.stringify(json))

    return {
      platformPostId: json.id,
      platformPostUrl: `https://www.pinterest.com/pin/${json.id}/`,
    }
  }

  async deletePost(platformPostId: string): Promise<void> {
    const url = `${PINTEREST_PINS_URL}/${platformPostId}`
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Pinterest API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const response = await fetch(PINTEREST_USER_URL, {
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Pinterest API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      id: string
      username: string
      profile_image: string
      account_type: string
      follower_count?: number
      following_count?: number
    }

    return {
      platformAccountId: data.id,
      displayName: data.username,
      username: data.username,
      avatarUrl: data.profile_image ?? '',
      profileUrl: `https://www.pinterest.com/${data.username}/`,
      accountType: data.account_type === 'BUSINESS' ? 'business' : 'personal',
      followerCount: data.follower_count,
      followingCount: data.following_count,
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
    if (!this.credentials.refreshToken || !this.credentials.apiKey || !this.credentials.apiKeySecret) {
      return null
    }

    const basicAuth = Buffer.from(`${this.credentials.apiKey}:${this.credentials.apiKeySecret}`).toString('base64')

    const response = await fetch(PINTEREST_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.credentials.refreshToken)}`,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Pinterest token refresh error ${response.status}: ${text}`)
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
      personUrn: this.credentials.personUrn,
    }
  }
}
