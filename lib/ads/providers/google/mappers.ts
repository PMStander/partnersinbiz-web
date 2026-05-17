// lib/ads/providers/google/mappers.ts
// Canonical ↔ Google status / network / bidding / micros / keyword mappers.
// Additive — Sub-3a Phase 2 Batch 1.

import type { AdEntityStatus } from '@/lib/ads/types'

// ─── Entity Status ────────────────────────────────────────────────────────────

export type GoogleEntityStatus = 'ENABLED' | 'PAUSED' | 'REMOVED'

/** canonical → Google campaign/adgroup/ad status */
export function googleEntityStatusFromCanonical(s: AdEntityStatus): GoogleEntityStatus {
  switch (s) {
    case 'ACTIVE': return 'ENABLED'
    case 'PAUSED': return 'PAUSED'
    case 'ARCHIVED': return 'REMOVED'
    case 'DRAFT':
    case 'PENDING_REVIEW':
    default:
      return 'PAUSED' // Drafts ship paused so they don't immediately spend
  }
}

/** Google → canonical entity status */
export function canonicalEntityStatusFromGoogle(g: string): AdEntityStatus {
  switch (g) {
    case 'ENABLED': return 'ACTIVE'
    case 'PAUSED': return 'PAUSED'
    case 'REMOVED': return 'ARCHIVED'
    default: return 'DRAFT'
  }
}

// ─── Network Settings ─────────────────────────────────────────────────────────

export interface GoogleNetworkSettings {
  targetGoogleSearch: boolean
  targetSearchNetwork: boolean
  targetContentNetwork: boolean
  targetPartnerSearchNetwork: boolean
}

/** Default network settings for a Search campaign — search + partner true, content false */
export function googleSearchNetworkSettings(): GoogleNetworkSettings {
  return {
    targetGoogleSearch: true,
    targetSearchNetwork: true,
    targetContentNetwork: false,
    targetPartnerSearchNetwork: false,
  }
}

/** Default network settings for a Display campaign — content true only */
export function googleDisplayNetworkSettings(): GoogleNetworkSettings {
  return {
    targetGoogleSearch: false,
    targetSearchNetwork: false,
    targetContentNetwork: true,
    targetPartnerSearchNetwork: false,
  }
}

// ─── Bidding Strategy ─────────────────────────────────────────────────────────

export type GoogleBiddingStrategyType =
  | 'MANUAL_CPC'
  | 'TARGET_CPA'
  | 'TARGET_ROAS'
  | 'MAXIMIZE_CONVERSIONS'
  | 'MAXIMIZE_CONVERSION_VALUE'

export interface GoogleBiddingStrategy {
  type: GoogleBiddingStrategyType
  targetCpaMicros?: string
  targetRoas?: number
  cpcBidCeilingMicros?: string
}

/** Default bidding strategy is MANUAL_CPC unless campaign carries an explicit target */
export function defaultBiddingStrategy(): GoogleBiddingStrategy {
  return { type: 'MANUAL_CPC' }
}

// ─── Micros / Currency ────────────────────────────────────────────────────────

/** Major-unit currency → Google micros string (Google uses string for int64) */
export function microsFromMajor(majorAmount: number): string {
  if (!Number.isFinite(majorAmount) || majorAmount < 0) {
    throw new Error(`Invalid major amount: ${majorAmount}`)
  }
  return Math.round(majorAmount * 1_000_000).toString()
}

/** Google micros (string or number) → major-unit currency */
export function majorFromMicros(microsAmount: string | number): number {
  const n = typeof microsAmount === 'string' ? parseInt(microsAmount, 10) : microsAmount
  if (!Number.isFinite(n)) throw new Error(`Invalid micros: ${microsAmount}`)
  return n / 1_000_000
}

// ─── Keyword Match Types ──────────────────────────────────────────────────────

export type AdKeywordMatchType = 'EXACT' | 'PHRASE' | 'BROAD'

export function googleKeywordMatchType(m: AdKeywordMatchType): 'EXACT' | 'PHRASE' | 'BROAD' {
  return m // identity — canonical mirrors Google's three primary match types
}

export function canonicalKeywordMatchTypeFromGoogle(g: string): AdKeywordMatchType {
  if (g === 'EXACT' || g === 'PHRASE' || g === 'BROAD') return g
  // BROAD_MATCH_MODIFIER is deprecated; treat as BROAD
  return 'BROAD'
}

// ─── Ad Group / Campaign Types ────────────────────────────────────────────────

export type GoogleAdGroupType =
  | 'SEARCH_STANDARD'
  | 'DISPLAY_STANDARD'
  | 'VIDEO_BUMPER'
  | 'VIDEO_NON_SKIPPABLE_IN_STREAM'
  | 'VIDEO_TRUE_VIEW_IN_STREAM'
  | 'SHOPPING_PRODUCT_ADS'

export type GoogleCampaignType = 'SEARCH' | 'DISPLAY' | 'SHOPPING'

export function googleAdGroupTypeFor(campaignType: GoogleCampaignType): GoogleAdGroupType {
  switch (campaignType) {
    case 'DISPLAY': return 'DISPLAY_STANDARD'
    case 'SHOPPING': return 'SHOPPING_PRODUCT_ADS'
    case 'SEARCH':
    default: return 'SEARCH_STANDARD'
  }
}

/** Default bidding for Display — MAXIMIZE_CONVERSIONS auto-bid is Google's recommended default */
export function defaultDisplayBiddingStrategy() {
  return { maximizeConversions: {} } as const
}
