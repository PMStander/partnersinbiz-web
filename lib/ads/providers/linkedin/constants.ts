// lib/ads/providers/linkedin/constants.ts
//
// LinkedIn Marketing API constants for the ads module.
// API base + REST.li versioned header.
// Version reference: https://learn.microsoft.com/en-us/linkedin/marketing/versioning
// Current monthly version pinned below — update when LinkedIn retires prior versions.

/** LinkedIn Marketing API REST base URL (REST.li v2). */
export const LINKEDIN_ADS_API_BASE = 'https://api.linkedin.com/rest'

/** LinkedIn Marketing API monthly version header value (YYYYMM format). */
export const LINKEDIN_ADS_VERSION = '202405'

export const LINKEDIN_OAUTH_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization'
export const LINKEDIN_OAUTH_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

/**
 * Scopes required for LinkedIn Marketing API.
 * SEPARATE from the social-posting OAuth scopes in lib/social/oauth-config.ts —
 * the ads flow uses a dedicated OAuth app with its own credentials
 * (LINKEDIN_ADS_CLIENT_ID / LINKEDIN_ADS_CLIENT_SECRET).
 */
export const LINKEDIN_ADS_SCOPES = [
  'r_ads',                 // read ad accounts + campaigns
  'rw_ads',                // create/update ad campaigns
  'r_ads_reporting',       // ad analytics
  'rw_organization_admin', // act on behalf of org page (sponsored content)
] as const

export type LinkedinAdsScope = (typeof LINKEDIN_ADS_SCOPES)[number]

/** Callback path the ads-module LinkedIn OAuth flow redirects to. */
export const LINKEDIN_ADS_REDIRECT_PATH = '/api/v1/ads/linkedin/oauth/callback'
