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
