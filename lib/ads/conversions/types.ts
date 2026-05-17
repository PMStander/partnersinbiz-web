// lib/ads/conversions/types.ts
import type { AdConversionPlatform } from '@/lib/ads/types'

/** Cross-platform conversion event input — translated to either Meta CAPI or Google Enhanced Conversions */
export interface ConversionEventInput {
  orgId: string
  /** Canonical Conversion Action ID — looks up doc to discover platform + per-platform resource */
  conversionActionId: string
  /** Unique event ID for dedupe (also used as Meta event_id + Google order_id) */
  eventId: string
  /** When the conversion happened */
  eventTime: Date
  value?: number
  currency?: string
  user: {
    email?: string
    phone?: string
    firstName?: string
    lastName?: string
    countryCode?: string
    postalCode?: string
  }
  /** For Google — Google Click ID, takes precedence over user identifiers when present */
  gclid?: string
  /** Extra metadata — passed through to Meta CAPI custom_data */
  customData?: Record<string, unknown>
}

export interface ConversionFanoutResult {
  /** 'sent' if the platform's fanout succeeded, 'failed' if it threw, 'skipped' if not configured */
  meta?: 'sent' | 'failed' | 'skipped'
  google?: 'sent' | 'failed' | 'skipped'
  /** Per-platform error message when 'failed' */
  metaError?: string
  googleError?: string
}

// Re-export for convenience
export type { AdConversionPlatform }
