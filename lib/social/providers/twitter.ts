/**
 * Twitter (X) Provider — OAuth 1.0a implementation.
 *
 * Migrated from lib/social/twitter.ts into the provider pattern.
 * Supports single tweets, threads, and deletion.
 */
import crypto from 'crypto'
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo } from './types'

const TWEETS_URL = 'https://api.twitter.com/2/tweets'
const USERS_ME_URL = 'https://api.twitter.com/2/users/me'

// RFC 3986 percent-encoding
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function buildOAuthHeader(
  method: string,
  url: string,
  apiKey: string,
  apiKeySecret: string,
  accessToken: string,
  accessTokenSecret: string,
): string {
  const urlObj = new URL(url)
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  const urlQueryParams: Record<string, string> = {}
  urlObj.searchParams.forEach((value, key) => {
    urlQueryParams[key] = value
  })

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }

  const allParams: Record<string, string> = { ...urlQueryParams, ...oauthParams }

  const encodedPairs = Object.entries(allParams)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as [string, string])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const baseString = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(encodedPairs),
  ].join('&')

  const signingKey = `${percentEncode(apiKeySecret)}&${percentEncode(accessTokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')

  const signedOAuthParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  }

  const headerParts = Object.entries(signedOAuthParams)
    .map(([k, v]) => `${k}="${percentEncode(v)}"`)
    .join(', ')

  return `OAuth ${headerParts}`
}

export class TwitterProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('twitter', credentials)
    if (!credentials.apiKey) throw new Error('TwitterProvider requires apiKey')
    if (!credentials.apiKeySecret) throw new Error('TwitterProvider requires apiKeySecret')
    if (!credentials.accessToken) throw new Error('TwitterProvider requires accessToken')
    if (!credentials.accessTokenSecret) throw new Error('TwitterProvider requires accessTokenSecret')
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): TwitterProvider {
    const apiKey = process.env.X_API_KEY
    const apiKeySecret = process.env.X_API_KEY_SECRET
    const accessToken = process.env.X_ACCESS_TOKEN
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET
    if (!apiKey) throw new Error('Missing env var: X_API_KEY')
    if (!apiKeySecret) throw new Error('Missing env var: X_API_KEY_SECRET')
    if (!accessToken) throw new Error('Missing env var: X_ACCESS_TOKEN')
    if (!accessTokenSecret) throw new Error('Missing env var: X_ACCESS_TOKEN_SECRET')
    return new TwitterProvider({ apiKey, apiKeySecret, accessToken, accessTokenSecret })
  }

  private getAuthHeader(method: string, url: string): string {
    return buildOAuthHeader(
      method,
      url,
      this.credentials.apiKey!,
      this.credentials.apiKeySecret!,
      this.credentials.accessToken,
      this.credentials.accessTokenSecret!,
    )
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    // If thread parts provided, publish as thread and return first ID
    if (options.threadParts && options.threadParts.length > 0) {
      const results = await this.publishThread(options.threadParts)
      return results[0]
    }

    const authHeader = this.getAuthHeader('POST', TWEETS_URL)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyObj: any = { text: options.text }
    if (options.replyToId) {
      bodyObj.reply = { in_reply_to_tweet_id: options.replyToId }
    }

    const response = await fetch(TWEETS_URL, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Twitter API error ${response.status}: ${text}`)
    }

    const json = await response.json() as { data: { id: string } }
    if (!json?.data?.id) throw new Error('Twitter API returned unexpected response: ' + JSON.stringify(json))

    return {
      platformPostId: json.data.id,
      platformPostUrl: `https://x.com/i/status/${json.data.id}`,
    }
  }

  async publishThread(parts: string[]): Promise<PublishResult[]> {
    if (parts.length === 0) throw new Error('publishThread requires at least one part')

    const results: PublishResult[] = []

    for (let i = 0; i < parts.length; i++) {
      const result = await this.publishPost({
        text: parts[i],
        replyToId: results[results.length - 1]?.platformPostId,
      })
      results.push(result)
    }

    return results
  }

  async deletePost(platformPostId: string): Promise<void> {
    const url = `${TWEETS_URL}/${platformPostId}`
    const authHeader = this.getAuthHeader('DELETE', url)
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Twitter API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const url = `${USERS_ME_URL}?user.fields=profile_image_url,public_metrics,description`
    const authHeader = this.getAuthHeader('GET', url)
    const response = await fetch(url, {
      headers: { Authorization: authHeader },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Twitter API error ${response.status}: ${text}`)
    }
    const json = await response.json() as {
      data: {
        id: string
        name: string
        username: string
        profile_image_url?: string
        public_metrics?: { followers_count: number; following_count: number }
      }
    }
    const d = json.data
    return {
      platformAccountId: d.id,
      displayName: d.name,
      username: d.username,
      avatarUrl: d.profile_image_url ?? '',
      profileUrl: `https://x.com/${d.username}`,
      accountType: 'personal',
      followerCount: d.public_metrics?.followers_count,
      followingCount: d.public_metrics?.following_count,
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
    // X OAuth 1.0a tokens don't expire — no refresh needed
    return null
  }
}
