/**
 * Dribbble Provider — Design platform API implementation.
 *
 * Supports posting shots (design projects) with images, deletion, and profile retrieval.
 * Uses OAuth 2.0 Bearer token authentication.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo } from './types'

export class DribbbleProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('dribbble', credentials)
    if (!credentials.accessToken) throw new Error('DribbbleProvider requires accessToken')
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): DribbbleProvider {
    const accessToken = process.env.DRIBBBLE_ACCESS_TOKEN
    if (!accessToken) throw new Error('Missing env var: DRIBBBLE_ACCESS_TOKEN')
    return new DribbbleProvider({ accessToken })
  }

  /** Get the API base URL */
  private getBaseUrl(): string {
    return 'https://api.dribbble.com/v2'
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    // Dribbble requires a title and image
    const title = options.title || options.text.split('\n')[0] || 'Untitled'
    const description = options.text

    // Dribbble shots require at least one image
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      throw new Error('Dribbble shots require at least one image')
    }

    const url = `${this.getBaseUrl()}/shots`

    // Fetch the image and create FormData
    const imageUrl = options.mediaUrls[0]
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)

    const buffer = await response.arrayBuffer()
    const mimeType = response.headers.get('content-type') || 'image/png'

    const formData = new FormData()
    formData.append('title', title)
    if (description) {
      formData.append('description', description)
    }
    formData.append('image', new Blob([buffer], { type: mimeType }), 'shot.png')

    const uploadResponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
      body: formData,
    })

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text()
      throw new Error(`Dribbble API error ${uploadResponse.status}: ${text}`)
    }

    const json = await uploadResponse.json() as { id: number; html_url: string }
    if (!json?.id) throw new Error('Dribbble API returned unexpected response: ' + JSON.stringify(json))

    return {
      platformPostId: String(json.id),
      platformPostUrl: json.html_url,
    }
  }

  async deletePost(platformPostId: string): Promise<void> {
    const url = `${this.getBaseUrl()}/shots/${platformPostId}`
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Dribbble API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const url = `${this.getBaseUrl()}/user`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Dribbble API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      id: number
      name: string
      username: string
      avatar_url: string
      html_url: string
      followers_count?: number
      following_count?: number
    }

    return {
      platformAccountId: String(data.id),
      displayName: data.name || data.username,
      username: data.username,
      avatarUrl: data.avatar_url || '',
      profileUrl: data.html_url || `https://dribbble.com/${data.username}`,
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
    // Dribbble tokens are long-lived; refresh not needed
    return null
  }
}
