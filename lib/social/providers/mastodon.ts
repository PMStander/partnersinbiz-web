/**
 * Mastodon Provider — ActivityPub/Mastodon API implementation.
 *
 * Supports text posts, threads via reply references, media uploads, and deletion.
 * Instance-specific API with Bearer token authentication.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo } from './types'

export class MastodonProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('mastodon', credentials)
    if (!credentials.accessToken) throw new Error('MastodonProvider requires accessToken')
    if (!credentials.instanceUrl) throw new Error('MastodonProvider requires instanceUrl')
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): MastodonProvider {
    const accessToken = process.env.MASTODON_ACCESS_TOKEN
    const instanceUrl = process.env.MASTODON_INSTANCE_URL
    if (!accessToken) throw new Error('Missing env var: MASTODON_ACCESS_TOKEN')
    if (!instanceUrl) throw new Error('Missing env var: MASTODON_INSTANCE_URL')
    return new MastodonProvider({ accessToken, instanceUrl })
  }

  /** Get the API base URL for the instance */
  private getBaseUrl(): string {
    return this.credentials.instanceUrl!.replace(/\/$/, '')
  }

  /** Upload media and return media ID */
  private async uploadMedia(mediaUrl: string): Promise<string> {
    try {
      const response = await fetch(mediaUrl)
      if (!response.ok) throw new Error(`Failed to fetch media: ${response.statusText}`)

      const buffer = await response.arrayBuffer()
      const mimeType = response.headers.get('content-type') || 'image/jpeg'

      const formData = new FormData()
      formData.append('file', new Blob([buffer], { type: mimeType }), 'media')

      const uploadResponse = await fetch(`${this.getBaseUrl()}/api/v2/media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
        },
        body: formData,
      })

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text()
        throw new Error(`Mastodon media upload error ${uploadResponse.status}: ${text}`)
      }

      const data = await uploadResponse.json() as { id: string }
      if (!data?.id) throw new Error('Mastodon media upload returned no ID')

      return data.id
    } catch (err) {
      // If media upload fails, log but continue (media is optional)
      console.warn('Mastodon media upload failed:', err)
      return ''
    }
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    // If thread parts provided, publish as thread and return first ID
    if (options.threadParts && options.threadParts.length > 0) {
      const results = await this.publishThread(options.threadParts)
      return results[0]
    }

    const url = `${this.getBaseUrl()}/api/v1/statuses`

    // Upload media if provided
    const mediaIds: string[] = []
    if (options.mediaUrls && options.mediaUrls.length > 0) {
      for (const mediaUrl of options.mediaUrls) {
        const mediaId = await this.uploadMedia(mediaUrl)
        if (mediaId) mediaIds.push(mediaId)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      status: options.text,
    }

    if (options.replyToId) {
      body.in_reply_to_id = options.replyToId
    }

    if (mediaIds.length > 0) {
      body.media_ids = mediaIds
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Mastodon API error ${response.status}: ${text}`)
    }

    const json = await response.json() as { id: string; url: string }
    if (!json?.id) throw new Error('Mastodon API returned unexpected response: ' + JSON.stringify(json))

    return {
      platformPostId: json.id,
      platformPostUrl: json.url,
    }
  }

  async publishThread(parts: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')

    const results: PublishResult[] = []

    for (let i = 0; i < parts.length; i++) {
      const url = `${this.getBaseUrl()}/api/v1/statuses`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        status: parts[i],
      }

      // Reply to previous post for proper threading
      if (i > 0) {
        body.in_reply_to_id = results[results.length - 1].platformPostId
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Mastodon API error ${response.status}: ${text}`)
      }

      const json = await response.json() as { id: string; url: string }
      if (!json?.id) throw new Error('Mastodon API returned unexpected response: ' + JSON.stringify(json))

      results.push({
        platformPostId: json.id,
        platformPostUrl: json.url,
      })
    }

    return results
  }

  async deletePost(platformPostId: string): Promise<void> {
    const url = `${this.getBaseUrl()}/api/v1/statuses/${platformPostId}`
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Mastodon API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const url = `${this.getBaseUrl()}/api/v1/accounts/verify_credentials`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Mastodon API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      id: string
      username: string
      acct: string
      display_name: string
      avatar: string
      url: string
      followers_count?: number
      following_count?: number
    }

    return {
      platformAccountId: data.id,
      displayName: data.display_name || data.username,
      username: data.acct || data.username,
      avatarUrl: data.avatar || '',
      profileUrl: data.url || `${this.getBaseUrl()}/@${data.username}`,
      accountType: 'personal',
      followerCount: data.followers_count,
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
    // Mastodon tokens do not expire
    return null
  }
}
