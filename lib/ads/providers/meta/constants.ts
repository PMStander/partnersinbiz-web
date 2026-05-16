// lib/ads/providers/meta/constants.ts
export const META_GRAPH_API_VERSION = 'v25.0'
export const META_OAUTH_DIALOG_URL = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

/**
 * Scopes requested when connecting a PiB org to Meta for ads management.
 * Added to the existing PiB Meta app (App ID 133722058771742). The Login for
 * Business config must list each of these in the configured flow before
 * Meta will return them.
 */
export const META_ADS_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
] as const

export type MetaAdsScope = (typeof META_ADS_SCOPES)[number]

export const META_REDIRECT_PATH = '/api/v1/ads/connections/meta/callback'
