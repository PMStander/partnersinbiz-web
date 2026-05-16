// lib/ads/types.ts
import type { Timestamp } from 'firebase-admin/firestore'
import type { EncryptedData } from '@/lib/social/encryption'

export type AdPlatform = 'meta' | 'google' | 'linkedin' | 'tiktok'

export const AD_PLATFORMS: readonly AdPlatform[] = ['meta', 'google', 'linkedin', 'tiktok'] as const

export function isAdPlatform(v: unknown): v is AdPlatform {
  return typeof v === 'string' && (AD_PLATFORMS as readonly string[]).includes(v)
}

/** A platform-side ad account (Meta act_xxx, Google customer, LinkedIn account, TikTok advertiser). */
export interface AdAccount {
  /** Platform-native ID. For Meta this is the `act_XXXXXXXXX` string. */
  id: string
  name: string
  currency: string // ISO 4217
  timezone: string // IANA tz string
  businessId?: string // Meta Business Manager ID when applicable
  status?: 'ACTIVE' | 'DISABLED' | 'UNSETTLED' | 'PENDING_RISK_REVIEW' | 'IN_GRACE_PERIOD' | 'UNKNOWN'
}

export type AdConnectionStatus = 'active' | 'expired' | 'revoked' | 'error'

export interface AdConnection {
  id: string
  orgId: string
  platform: AdPlatform
  status: AdConnectionStatus
  /** Platform-side user ID who granted access. For Meta this is the FB user ID. */
  userId: string
  scopes: string[]
  /** Cached discovery — refreshed on demand. */
  adAccounts: AdAccount[]
  defaultAdAccountId?: string
  /** 'user' = per-user OAuth token; 'system' = long-lived agency / system user token. */
  tokenType: 'user' | 'system'
  accessTokenEnc: EncryptedData
  refreshTokenEnc?: EncryptedData
  /** Long-lived Meta tokens last ~60 days. Stored as Firestore Timestamp. */
  expiresAt: Timestamp
  lastError?: string
  meta?: Record<string, unknown>
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Canonical campaign objectives. UI ships 3 in Phase 2; the rest are forward-compatible. */
export type AdObjective = 'TRAFFIC' | 'LEADS' | 'SALES' | 'AWARENESS' | 'ENGAGEMENT'

export const AD_OBJECTIVES_MVP: readonly AdObjective[] = ['TRAFFIC', 'LEADS', 'SALES'] as const

export type AdEntityStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'ARCHIVED'
  | 'PENDING_REVIEW'

/** Canonical AdTargeting — Phase 2+ populates this; declared here for forward use. */
export interface AdTargeting {
  geo: {
    countries?: string[]
    regions?: Array<{ country: string; key: string; name: string }>
    cities?: Array<{
      country: string
      key: string
      name: string
      radius?: number
      distanceUnit?: 'mile' | 'kilometer'
    }>
    zips?: Array<{ country: string; key: string }>
    locationTypes?: Array<'home' | 'recent' | 'travel_in' | 'recently_in'>
  }
  demographics: {
    ageMin: number
    ageMax: number
    genders?: Array<'male' | 'female'>
    languages?: number[]
  }
  interests?: Array<{ id: string; name: string }>
  behaviors?: Array<{ id: string; name: string }>
  customAudiences?: { include: string[]; exclude: string[] }
  savedAudienceId?: string
  advantage?: {
    detailedTargetingExpansion?: boolean
    lookalikeExpansion?: boolean
  }
}

// ─── Campaign ────────────────────────────────────────────────────────────────

export type AdBidStrategy =
  | 'LOWEST_COST'
  | 'COST_CAP'
  | 'BID_CAP'
  | 'TARGET_COST'
  | 'ROAS_GOAL'

export interface AdCampaign {
  id: string
  orgId: string
  platform: AdPlatform
  adAccountId: string
  name: string
  objective: AdObjective
  status: AdEntityStatus
  dailyBudget?: number // cents in ad account currency
  lifetimeBudget?: number // cents
  cboEnabled: boolean
  bidStrategy?: AdBidStrategy
  startTime?: Timestamp
  endTime?: Timestamp
  specialAdCategories: string[] // [] | ['CREDIT'] | ['EMPLOYMENT'] | ['HOUSING'] | ['SOCIAL_ISSUES']
  providerData: { meta?: Record<string, unknown> }
  lastRefreshedAt?: Timestamp
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type CreateAdCampaignInput = Omit<
  AdCampaign,
  'id' | 'orgId' | 'platform' | 'providerData' | 'createdBy' | 'createdAt' | 'updatedAt' | 'lastRefreshedAt'
>

export type UpdateAdCampaignInput = Partial<
  Omit<AdCampaign, 'id' | 'orgId' | 'platform' | 'adAccountId' | 'createdBy' | 'createdAt'>
>

// ─── AdSet ───────────────────────────────────────────────────────────────────

export type AdSetOptimizationGoal =
  | 'LINK_CLICKS'
  | 'IMPRESSIONS'
  | 'REACH'
  | 'POST_ENGAGEMENT'
  | 'CONVERSIONS'
  | 'LEAD_GENERATION'
  | 'OFFSITE_CONVERSIONS'
  | 'VIDEO_VIEWS'

export type AdSetBillingEvent = 'IMPRESSIONS' | 'LINK_CLICKS' | 'THRUPLAY'

export interface AdSetPlacements {
  feeds: boolean
  stories: boolean
  reels: boolean
  marketplace: boolean
}

export interface AdSet {
  id: string
  orgId: string
  campaignId: string
  platform: AdPlatform
  name: string
  status: AdEntityStatus
  dailyBudget?: number
  lifetimeBudget?: number
  bidAmount?: number // cents
  optimizationGoal: AdSetOptimizationGoal
  billingEvent: AdSetBillingEvent
  targeting: AdTargeting
  placements: AdSetPlacements
  startTime?: Timestamp
  endTime?: Timestamp
  providerData: { meta?: Record<string, unknown> }
  lastRefreshedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type CreateAdSetInput = Omit<
  AdSet,
  'id' | 'orgId' | 'platform' | 'providerData' | 'createdAt' | 'updatedAt' | 'lastRefreshedAt'
>

export type UpdateAdSetInput = Partial<
  Omit<AdSet, 'id' | 'orgId' | 'platform' | 'campaignId' | 'createdAt'>
>

// ─── Ad ──────────────────────────────────────────────────────────────────────

export type AdFormat = 'SINGLE_IMAGE' | 'SINGLE_VIDEO' | 'CAROUSEL'

export type AdCallToAction =
  | 'SHOP_NOW'
  | 'LEARN_MORE'
  | 'SIGN_UP'
  | 'CONTACT_US'
  | 'GET_OFFER'
  | 'SUBSCRIBE'
  | 'DOWNLOAD'
  | 'BOOK_NOW'
  | 'APPLY_NOW'
  | 'GET_QUOTE'

export interface AdCopy {
  primaryText: string
  headline: string
  description?: string
  callToAction?: AdCallToAction
  destinationUrl?: string
}

export interface Ad {
  id: string
  orgId: string
  adSetId: string
  campaignId: string
  platform: AdPlatform
  name: string
  status: AdEntityStatus
  format: AdFormat
  /** Phase 3+: references ad_creatives. Phase 2: empty array; image lives on inlineImageUrl. */
  creativeIds: string[]
  /** Phase 2 only: direct URL until creative library lands in Phase 3. */
  inlineImageUrl?: string
  /** For CAROUSEL format in Phase 2: array of inline image URLs (Phase 3 swaps to creative IDs). */
  inlineCarouselUrls?: string[]
  copy: AdCopy
  trackingUrls?: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
  providerData: { meta?: Record<string, unknown> }
  lastRefreshedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type CreateAdInput = Omit<
  Ad,
  'id' | 'orgId' | 'platform' | 'providerData' | 'createdAt' | 'updatedAt' | 'lastRefreshedAt'
>

export type UpdateAdInput = Partial<
  Omit<Ad, 'id' | 'orgId' | 'platform' | 'adSetId' | 'campaignId' | 'createdAt'>
>
