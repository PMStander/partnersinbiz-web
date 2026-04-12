/**
 * Bluesky Provider — AT Protocol implementation.
 *
 * Uses app passwords and session tokens (no OAuth).
 * Supports text posts, threads via reply references, and deletion.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo } from './types'

export class BlueskyProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('bluesky', credentials)
    if (!credentials.accessToken) throw new Error('BlueskyProvider requires accessToken')
    if (!credentials.personUrn) throw new Error('BlueskyProvider requires personUrn (DID)')
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): BlueskyProvider {
    const accessToken = process.env.BLUESKY_ACCESS_TOKEN
    const refreshToken = process.env.BLUESKY_REFRESH_TOKEN
    const personUrn = process.env.BLUESKY_DID
    const apiKey = process.env.BLUESKY_HANDLE
    const apiKeySecret = process.env.BLUESKY_APP_PASSWORD
    const instanceUrl = process.env.BLUESKY_PDS_URL || 'https://bsky.social'
    if (!accessToken) throw new Error('Missing env var: BLUESKY_ACCESS_TOKEN')
    if (!personUrn) throw new Error('Missing env var: BLUESKY_DID')
    return new BlueskyProvider({ accessToken, refreshToken, personUrn, apiKey, apiKeySecret, instanceUrl })
  }

  /** Get the XRPC base URL for the PDS instance */
  private getBaseUrl(): string {
    return `${this.credentials.instanceUrl || 'https://bsky.social'}/xrpc`
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    // If thread parts provided, publish as thread and return first ID
    if (options.threadParts && options.threadParts.length > 0) {
      const results = await this.publishThread(options.threadParts)
      return results[0]
    }

    const url = `${this.getBaseUrl()}/com.atproto.repo.createRecord`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record: any = {
      $type: 'app.bsky.feed.post',
      text: options.text,
      createdAt: new Date().toISOString(),
    }

    if (options.replyToId) {
      record.reply = {
        root: { uri: options.replyToId, cid: '' },
        parent: { uri: options.replyToId, cid: '' },
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: this.credentials.personUrn,
        collection: 'app.bsky.feed.post',
        record,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Bluesky API error ${response.status}: ${text}`)
    }

    const json = await response.json() as { uri: string; cid: string }
    if (!json?.uri) throw new Error('Bluesky API returned unexpected response: ' + JSON.stringify(json))

    const rkey = json.uri.split('/').pop()

    return {
      platformPostId: json.uri,
      platformPostUrl: `https://bsky.app/profile/${this.credentials.personUrn}/post/${rkey}`,
    }
  }

  async publishThread(parts: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')

    const results: PublishResult[] = []
    // Track root post URI and CID for proper thread references
    let rootUri = ''
    let rootCid = ''

    for (let i = 0; i < parts.length; i++) {
      const url = `${this.getBaseUrl()}/com.atproto.repo.createRecord`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const record: any = {
        $type: 'app.bsky.feed.post',
        text: parts[i],
        createdAt: new Date().toISOString(),
      }

      // Add reply references for non-root posts
      if (i > 0) {
        const parentResult = results[results.length - 1]
        record.reply = {
          root: { uri: rootUri, cid: rootCid },
          parent: { uri: parentResult.platformPostId, cid: '' },
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: this.credentials.personUrn,
          collection: 'app.bsky.feed.post',
          record,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Bluesky API error ${response.status}: ${text}`)
      }

      const json = await response.json() as { uri: string; cid: string }
      if (!json?.uri) throw new Error('Bluesky API returned unexpected response: ' + JSON.stringify(json))

      // Store root post info for thread references
      if (i === 0) {
        rootUri = json.uri
        rootCid = json.cid
      }

      const rkey = json.uri.split('/').pop()
      results.push({
        platformPostId: json.uri,
        platformPostUrl: `https://bsky.app/profile/${this.credentials.personUrn}/post/${rkey}`,
      })
    }

    return results
  }

  async deletePost(platformPostId: string): Promise<void> {
    // platformPostId is a URI like at://did/app.bsky.feed.post/rkey
    const rkey = platformPostId.split('/').pop()
    if (!rkey) throw new Error('Could not extract rkey from post URI: ' + platformPostId)

    const url = `${this.getBaseUrl()}/com.atproto.repo.deleteRecord`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: this.credentials.personUrn,
        collection: 'app.bsky.feed.post',
        rkey,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Bluesky API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const url = `${this.getBaseUrl()}/app.bsky.actor.getProfile?actor=${this.credentials.personUrn}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Bluesky API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      did: string
      handle: string
      displayName?: string
      avatar?: string
      followersCount?: number
      followsCount?: number
    }

    return {
      platformAccountId: data.did,
      displayName: data.displayName ?? data.handle,
      username: data.handle,
      avatarUrl: data.avatar ?? '',
      profileUrl: `https://bsky.app/profile/${data.handle}`,
      accountType: 'personal',
      followerCount: data.followersCount,
      followingCount: data.followsCount,
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
    const baseUrl = this.getBaseUrl()

    // If we have a refresh token, use it to get new session tokens
    if (this.credentials.refreshToken) {
      const response = await fetch(`${baseUrl}/com.atproto.server.refreshSession`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.refreshToken}`,
        },
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Bluesky refresh session error ${response.status}: ${text}`)
      }

      const data = await response.json() as {
        accessJwt: string
        refreshJwt: string
        did: string
        handle: string
      }

      return {
        ...this.credentials,
        accessToken: data.accessJwt,
        refreshToken: data.refreshJwt,
        personUrn: data.did,
        apiKey: data.handle,
      }
    }

    // If we have handle + app password but no refresh token, create a new session
    if (this.credentials.apiKey && this.credentials.apiKeySecret) {
      const response = await fetch(`${baseUrl}/com.atproto.server.createSession`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: this.credentials.apiKey,
          password: this.credentials.apiKeySecret,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Bluesky create session error ${response.status}: ${text}`)
      }

      const data = await response.json() as {
        accessJwt: string
        refreshJwt: string
        did: string
        handle: string
      }

      return {
        ...this.credentials,
        accessToken: data.accessJwt,
        refreshToken: data.refreshJwt,
        personUrn: data.did,
        apiKey: data.handle,
      }
    }

    return null
  }
}
