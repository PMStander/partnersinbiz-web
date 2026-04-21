/**
 * Threads Provider — OAuth 2.0 Bearer token implementation via Meta Threads API.
 *
 * Uses the Threads API (v1.0) for publishing, profile retrieval, and analytics.
 * Publishing uses a 2-step container API: create container, then publish container.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo, AnalyticsData } from './types'

const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

export class ThreadsProvider extends SocialProvider {
  private userId: string
  private username: string | null = null

  constructor(credentials: ProviderCredentials) {
    super('threads', credentials)
    if (!credentials.accessToken) throw new Error('ThreadsProvider requires accessToken')
    if (!credentials.personUrn) throw new Error('ThreadsProvider requires personUrn (Threads user ID)')
    this.userId = credentials.personUrn
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): ThreadsProvider {
    const accessToken = process.env.THREADS_ACCESS_TOKEN
    const personUrn = process.env.THREADS_USER_ID
    if (!accessToken) throw new Error('Missing env var: THREADS_ACCESS_TOKEN')
    if (!personUrn) throw new Error('Missing env var: THREADS_USER_ID')
    return new ThreadsProvider({ accessToken, personUrn })
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    const { text, mediaUrls, replyToId } = options

    // If thread parts provided, publish as thread and return first ID
    if (options.threadParts && options.threadParts.length > 0) {
      const results = await this.publishThread(options.threadParts)
      return results[0]
    }

    // Determine media type and build container body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const containerBody: any = {
      text,
      access_token: this.credentials.accessToken,
    }

    if (replyToId) {
      containerBody.reply_to_id = replyToId
    }

    if (mediaUrls && mediaUrls.length > 1) {
      // Carousel: create child containers first
      return this.publishCarousel(text, mediaUrls, replyToId)
    } else if (mediaUrls && mediaUrls.length === 1) {
      const mediaUrl = mediaUrls[0]
      if (this.isVideoUrl(mediaUrl)) {
        containerBody.media_type = 'VIDEO'
        containerBody.video_url = mediaUrl
      } else {
        containerBody.media_type = 'IMAGE'
        containerBody.image_url = mediaUrl
      }
    } else {
      containerBody.media_type = 'TEXT'
    }

    // Step 1: Create container
    const containerResponse = await fetch(`${THREADS_API_BASE}/${this.userId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    })

    if (!containerResponse.ok) {
      const errText = await containerResponse.text()
      throw new Error(`Threads API error ${containerResponse.status}: ${errText}`)
    }

    const containerJson = await containerResponse.json() as { id: string }
    if (!containerJson?.id) throw new Error('Threads API returned unexpected response: ' + JSON.stringify(containerJson))

    // Step 2: Publish the container
    const threadId = await this.publishContainer(containerJson.id)

    // Resolve username for post URL
    const username = await this.resolveUsername()

    return {
      platformPostId: threadId,
      platformPostUrl: `https://www.threads.net/@${username}/post/${threadId}`,
    }
  }

  private async publishCarousel(text: string, mediaUrls: string[], replyToId?: string): Promise<PublishResult> {
    // Step 1: Create item containers for each media
    const childIds: string[] = []

    for (const mediaUrl of mediaUrls) {
      const isVideo = this.isVideoUrl(mediaUrl)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemBody: any = {
        is_carousel_item: true,
        access_token: this.credentials.accessToken,
      }

      if (isVideo) {
        itemBody.media_type = 'VIDEO'
        itemBody.video_url = mediaUrl
      } else {
        itemBody.media_type = 'IMAGE'
        itemBody.image_url = mediaUrl
      }

      const itemResponse = await fetch(`${THREADS_API_BASE}/${this.userId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemBody),
      })

      if (!itemResponse.ok) {
        const errText = await itemResponse.text()
        throw new Error(`Threads API carousel item error ${itemResponse.status}: ${errText}`)
      }

      const itemJson = await itemResponse.json() as { id: string }
      if (!itemJson?.id) throw new Error('Threads API returned unexpected carousel item response: ' + JSON.stringify(itemJson))
      childIds.push(itemJson.id)
    }

    // Step 2: Create carousel container
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const carouselBody: any = {
      media_type: 'CAROUSEL',
      text,
      children: childIds,
      access_token: this.credentials.accessToken,
    }

    if (replyToId) {
      carouselBody.reply_to_id = replyToId
    }

    const carouselResponse = await fetch(`${THREADS_API_BASE}/${this.userId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(carouselBody),
    })

    if (!carouselResponse.ok) {
      const errText = await carouselResponse.text()
      throw new Error(`Threads API carousel error ${carouselResponse.status}: ${errText}`)
    }

    const carouselJson = await carouselResponse.json() as { id: string }
    if (!carouselJson?.id) throw new Error('Threads API returned unexpected carousel response: ' + JSON.stringify(carouselJson))

    // Step 3: Publish the carousel container
    const threadId = await this.publishContainer(carouselJson.id)

    const username = await this.resolveUsername()

    return {
      platformPostId: threadId,
      platformPostUrl: `https://www.threads.net/@${username}/post/${threadId}`,
    }
  }

  private async publishContainer(containerId: string): Promise<string> {
    const publishResponse = await fetch(`${THREADS_API_BASE}/${this.userId}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: this.credentials.accessToken,
      }),
    })

    if (!publishResponse.ok) {
      const errText = await publishResponse.text()
      throw new Error(`Threads API publish error ${publishResponse.status}: ${errText}`)
    }

    const publishJson = await publishResponse.json() as { id: string }
    if (!publishJson?.id) throw new Error('Threads API returned unexpected publish response: ' + JSON.stringify(publishJson))

    return publishJson.id
  }

  async publishThread(parts: string[], mediaUrls?: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')
    const results: PublishResult[] = []
    for (let i = 0; i < parts.length; i++) {
      const result = await this.publishPost({
        text: parts[i],
        replyToId: results[results.length - 1]?.platformPostId,
        mediaUrls: i === 0 ? mediaUrls : undefined,
      })
      results.push(result)
    }
    return results
  }

  async deletePost(platformPostId: string): Promise<void> {
    const url = `${THREADS_API_BASE}/${platformPostId}?access_token=${this.credentials.accessToken}`
    const response = await fetch(url, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Threads API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const url = `${THREADS_API_BASE}/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${this.credentials.accessToken}`
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Threads API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      id: string
      username: string
      threads_profile_picture_url?: string
      threads_biography?: string
    }

    // Cache username for post URL construction
    this.username = data.username

    return {
      platformAccountId: data.id,
      displayName: data.username,
      username: data.username,
      avatarUrl: data.threads_profile_picture_url ?? '',
      profileUrl: `https://www.threads.net/@${data.username}`,
      accountType: 'personal',
      meta: { biography: data.threads_biography },
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
    // Threads long-lived tokens (60 days) are refreshed with th_refresh_token grant
    // Must be called before the token expires
    const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${this.credentials.accessToken}`
    const response = await fetch(url)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Threads token refresh error ${response.status}: ${text}`)
    }

    const data = await response.json() as { access_token: string; token_type: string; expires_in?: number }

    return {
      accessToken: data.access_token,
      personUrn: this.userId,
      apiKeySecret: this.credentials.apiKeySecret,
    }
  }

  async getAnalytics(platformPostId: string): Promise<AnalyticsData | null> {
    const url = `${THREADS_API_BASE}/${platformPostId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${this.credentials.accessToken}`
    const response = await fetch(url)

    if (!response.ok) {
      // Analytics may not be available for all post types
      return null
    }

    const json = await response.json() as {
      data: Array<{ name: string; values: Array<{ value: number }> }>
    }

    const metrics: Record<string, number> = {}
    for (const entry of json.data ?? []) {
      metrics[entry.name] = entry.values?.[0]?.value ?? 0
    }

    return {
      impressions: metrics.views ?? 0,
      reach: 0,
      engagements: (metrics.likes ?? 0) + (metrics.replies ?? 0) + (metrics.reposts ?? 0) + (metrics.quotes ?? 0),
      likes: metrics.likes ?? 0,
      comments: metrics.replies ?? 0,
      shares: metrics.reposts ?? 0,
      saves: 0,
      clicks: 0,
    }
  }

  private isVideoUrl(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0]
    return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.avi')
  }

  private async resolveUsername(): Promise<string> {
    if (this.username) return this.username
    try {
      const profile = await this.getProfile()
      return profile.username
    } catch {
      return this.userId
    }
  }
}
