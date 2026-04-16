/**
 * LinkedIn Provider — OAuth 2.0 Bearer token implementation.
 *
 * Migrated from lib/social/linkedin.ts into the provider pattern.
 * Supports text posts and profile retrieval.
 */
import { SocialProvider, type ProviderCredentials, type PublishOptions } from './base'
import type { PublishResult, ProfileInfo } from './types'

const LINKEDIN_POSTS_URL = 'https://api.linkedin.com/rest/posts'
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'

export class LinkedInProvider extends SocialProvider {
  constructor(credentials: ProviderCredentials) {
    super('linkedin', credentials)
    if (!credentials.accessToken) throw new Error('LinkedInProvider requires accessToken')
    if (!credentials.personUrn) throw new Error('LinkedInProvider requires personUrn')
    if (!credentials.personUrn.startsWith('urn:li:person:') && !credentials.personUrn.startsWith('urn:li:organization:')) {
      throw new Error('personUrn must be urn:li:person:XXXX or urn:li:organization:XXXX')
    }
  }

  /** Create from environment variables (for the default account) */
  static fromEnv(): LinkedInProvider {
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN
    const personUrn = process.env.LINKEDIN_PERSON_URN
    if (!accessToken) throw new Error('Missing env var: LINKEDIN_ACCESS_TOKEN')
    if (!personUrn) throw new Error('Missing env var: LINKEDIN_PERSON_URN')
    return new LinkedInProvider({ accessToken, personUrn })
  }

  async publishPost(options: PublishOptions): Promise<PublishResult> {
    const body = JSON.stringify({
      author: this.credentials.personUrn,
      commentary: options.text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    })

    const response = await fetch(LINKEDIN_POSTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202502',
      },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinkedIn API error ${response.status}: ${text}`)
    }

    const urn = response.headers.get('x-restli-id')
    if (!urn) throw new Error('LinkedIn API did not return a post URN')

    return {
      platformPostId: urn,
      platformPostUrl: `https://www.linkedin.com/feed/update/${urn}`,
    }
  }

  async deletePost(platformPostId: string): Promise<void> {
    const url = `${LINKEDIN_POSTS_URL}/${platformPostId}`
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202502',
      },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinkedIn API delete error ${response.status}: ${text}`)
    }
  }

  async getProfile(): Promise<ProfileInfo> {
    const headers = {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202502',
    }

    // For org URNs, fetch org details from the organizations API
    if (this.credentials.personUrn?.startsWith('urn:li:organization:')) {
      const orgId = this.credentials.personUrn.split(':').pop()!
      const response = await fetch(
        `https://api.linkedin.com/v2/organizations/${orgId}?projection=(id,localizedName,vanityName,logoV2(original~:playableStreams))`,
        { headers },
      )
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`LinkedIn API error ${response.status}: ${text}`)
      }
      const org = await response.json() as { id: number; localizedName: string; vanityName?: string }
      const vanity = org.vanityName ?? String(org.id)
      return {
        platformAccountId: this.credentials.personUrn,
        displayName: org.localizedName,
        username: vanity,
        avatarUrl: '',
        profileUrl: `https://www.linkedin.com/company/${vanity}`,
        accountType: 'page',
      }
    }

    // Personal account
    const response = await fetch(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${this.credentials.accessToken}` },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinkedIn API error ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      sub: string
      name: string
      given_name?: string
      family_name?: string
      picture?: string
      email?: string
    }

    const personUrn = `urn:li:person:${data.sub}`
    return {
      platformAccountId: personUrn,
      displayName: data.name,
      username: data.email ?? data.sub,
      avatarUrl: data.picture ?? '',
      profileUrl: `https://www.linkedin.com/in/${data.sub}`,
      accountType: 'personal',
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
    // LinkedIn token refresh requires client_id/client_secret which are
    // stored per-account in Firestore. When full OAuth flow is implemented,
    // this will use the refresh_token grant. For now, env-based tokens
    // must be refreshed manually.
    return null
  }
}
