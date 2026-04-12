/**
 * Reddit Provider — OAuth 2.0 Bearer token implementation.
 *
 * Supports self posts, link posts, deletion, and profile retrieval.
 * Reddit tokens expire every 1 hour; refresh tokens are permanent.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo, AnalyticsData } from './types'

const REDDIT_API_URL = 'https://oauth.reddit.com'
const REDDIT_AUTH_URL = 'https://www.reddit.com/api/v1/access_token'
const USER_AGENT = 'partnersinbiz:v1.0.0 (by /u/partnersinbiz)'

export class RedditProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('reddit', credentials)
    if (!credentials.accessToken) throw new Error('RedditProvider requires accessToken')
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): RedditProvider {
    const accessToken = process.env.REDDIT_ACCESS_TOKEN
    const apiKey = process.env.REDDIT_CLIENT_ID
    const apiKeySecret = process.env.REDDIT_CLIENT_SECRET
    const refreshToken = process.env.REDDIT_REFRESH_TOKEN
    if (!accessToken) throw new Error('Missing env var: REDDIT_ACCESS_TOKEN')
    return new RedditProvider({ accessToken, apiKey, apiKeySecret, refreshToken })
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    // Extract subreddit from title if it starts with "r/" or use default
    let subreddit = 'partnersinbiz'
    let title = options.title || 'Post'

    if (title.startsWith('r/')) {
      const spaceIdx = title.indexOf(' ')
      if (spaceIdx > 0) {
        subreddit = title.substring(2, spaceIdx)
        title = title.substring(spaceIdx + 1).trim()
      } else {
        subreddit = title.substring(2)
        title = options.text.substring(0, 100)
      }
    }

    // If mediaUrls provided, submit as link post; otherwise self post
    const kind = options.mediaUrls && options.mediaUrls.length > 0 ? 'link' : 'self'

    const params = new URLSearchParams({
      api_type: 'json',
      sr: subreddit,
      kind,
      title,
    })

    if (kind === 'link') {
      params.set('url', options.mediaUrls![0])
    } else {
      params.set('text', options.text)
    }

    const response = await fetch(`${REDDIT_API_URL}/api/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Reddit API error ${response.status}: ${text}`)
    }

    const json = await response.json() as {
      json: {
        errors: string[][]
        data: { id: string; name: string; url: string }
      }
    }

    if (json.json.errors && json.json.errors.length > 0) {
      throw new Error(`Reddit API error: ${json.json.errors.map((e) => e.join(': ')).join(', ')}`)
    }

    if (!json.json?.data?.id) {
      throw new Error('Reddit API returned unexpected response: ' + JSON.stringify(json))
    }

    return {
      platformPostId: json.json.data.id,
      platformPostUrl: json.json.data.url,
    }
  }

  async deletePost(platformPostId: string): Promise<void> {
    const params = new URLSearchParams({
      id: `t3_${platformPostId}`,
    })

    const response = await fetch(`${REDDIT_API_URL}/api/del`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Reddit API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const response = await fetch(`${REDDIT_API_URL}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'User-Agent': USER_AGENT,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Reddit API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      id: string
      name: string
      icon_img?: string
      subreddit?: { subscribers?: number }
      link_karma?: number
      comment_karma?: number
    }

    return {
      platformAccountId: data.id,
      displayName: data.name,
      username: data.name,
      avatarUrl: data.icon_img ?? '',
      profileUrl: `https://www.reddit.com/user/${data.name}`,
      accountType: 'personal',
      followerCount: data.subreddit?.subscribers,
      meta: {
        linkKarma: data.link_karma,
        commentKarma: data.comment_karma,
      },
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

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.credentials.refreshToken,
    })

    const response = await fetch(REDDIT_AUTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Reddit token refresh error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      access_token: string
      token_type: string
      expires_in: number
      refresh_token?: string
      scope: string
    }

    this.credentials.accessToken = data.access_token
    if (data.refresh_token) {
      this.credentials.refreshToken = data.refresh_token
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.credentials.refreshToken,
      apiKey: this.credentials.apiKey,
      apiKeySecret: this.credentials.apiKeySecret,
    }
  }

  // Reddit does not expose per-post analytics via API — uses base class default (returns null)
  async getAnalytics(_platformPostId: string): Promise<AnalyticsData | null> {
    return null
  }
}
