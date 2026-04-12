/**
 * Facebook Provider — OAuth 2.0 Bearer token implementation.
 *
 * Uses the Facebook Graph API v19.0 for page posting, deletion,
 * profile retrieval, and post analytics.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo, AnalyticsData } from './types'

const GRAPH_BASE_URL = 'https://graph.facebook.com/v19.0'

export class FacebookProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('facebook', credentials)
    if (!credentials.accessToken) throw new Error('FacebookProvider requires accessToken')
    if (!credentials.personUrn) throw new Error('FacebookProvider requires personUrn (pageId)')
  }

  /** Create from environment variables (for the default page) */
  static fromEnv(): FacebookProvider {
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
    const personUrn = process.env.FACEBOOK_PAGE_ID
    if (!accessToken) throw new Error('Missing env var: FACEBOOK_PAGE_ACCESS_TOKEN')
    if (!personUrn) throw new Error('Missing env var: FACEBOOK_PAGE_ID')
    return new FacebookProvider({ accessToken, personUrn })
  }

  private get pageId(): string {
    return this.credentials.personUrn!
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    // If media URLs provided, publish as photo post
    if (options.mediaUrls && options.mediaUrls.length > 0) {
      return this.publishPhotoPost(options)
    }

    const url = `${GRAPH_BASE_URL}/${this.pageId}/feed`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: options.text,
        access_token: this.credentials.accessToken,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Facebook API error ${response.status}: ${text}`)
    }

    const json = await response.json() as { id: string }
    if (!json?.id) throw new Error('Facebook API returned unexpected response: ' + JSON.stringify(json))

    return {
      platformPostId: json.id,
      platformPostUrl: `https://www.facebook.com/${json.id}`,
    }
  }

  private async publishPhotoPost(options: PublishOptions): Promise<PublishResult> {
    const url = `${GRAPH_BASE_URL}/${this.pageId}/photos`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: options.text,
        url: options.mediaUrls![0],
        access_token: this.credentials.accessToken,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Facebook API error ${response.status}: ${text}`)
    }

    const json = await response.json() as { id: string; post_id?: string }
    if (!json?.id) throw new Error('Facebook API returned unexpected response: ' + JSON.stringify(json))

    const postId = json.post_id ?? json.id
    return {
      platformPostId: postId,
      platformPostUrl: `https://www.facebook.com/${postId}`,
    }
  }

  async deletePost(platformPostId: string): Promise<void> {
    const url = `${GRAPH_BASE_URL}/${platformPostId}?access_token=${this.credentials.accessToken}`
    const response = await fetch(url, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Facebook API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const url = `${GRAPH_BASE_URL}/me?fields=id,name,picture,fan_count&access_token=${this.credentials.accessToken}`
    const response = await fetch(url)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Facebook API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      id: string
      name: string
      picture?: { data?: { url?: string } }
      fan_count?: number
    }

    return {
      platformAccountId: data.id,
      displayName: data.name,
      username: data.id,
      avatarUrl: data.picture?.data?.url ?? '',
      profileUrl: `https://www.facebook.com/${data.id}`,
      accountType: 'page',
      followerCount: data.fan_count,
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
    // Long-lived token exchange requires client_id and client_secret
    if (!this.credentials.apiKey || !this.credentials.apiKeySecret) {
      return null
    }

    const url =
      `${GRAPH_BASE_URL}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${this.credentials.apiKey}` +
      `&client_secret=${this.credentials.apiKeySecret}` +
      `&fb_exchange_token=${this.credentials.accessToken}`

    const response = await fetch(url)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Facebook token refresh error ${response.status}: ${text}`)
    }

    const data = await response.json() as { access_token: string; token_type: string; expires_in?: number }
    if (!data?.access_token) throw new Error('Facebook token refresh returned unexpected response: ' + JSON.stringify(data))

    return {
      ...this.credentials,
      accessToken: data.access_token,
    }
  }

  async getAnalytics(platformPostId: string): Promise<AnalyticsData | null> {
    const url =
      `${GRAPH_BASE_URL}/${platformPostId}/insights` +
      `?metric=post_impressions,post_engagements` +
      `&access_token=${this.credentials.accessToken}`

    const response = await fetch(url)

    if (!response.ok) {
      // Analytics may not be available for all post types
      return null
    }

    const json = await response.json() as {
      data?: Array<{ name: string; values?: Array<{ value: number }> }>
    }

    if (!json?.data) return null

    let impressions = 0
    let engagements = 0

    for (const metric of json.data) {
      const value = metric.values?.[0]?.value ?? 0
      if (metric.name === 'post_impressions') impressions = value
      if (metric.name === 'post_engagements') engagements = value
    }

    return {
      impressions,
      reach: 0,
      engagements,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      clicks: 0,
    }
  }
}
