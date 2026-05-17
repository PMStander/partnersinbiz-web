// lib/ads/providers/google/client.ts
//
// Thin re-export of the existing analytics-adapter Google Ads REST client.
// The ads module reuses the analytics adapter's authenticated client factory
// so both modules sign requests identically (developer-token, login-customer-id,
// retry semantics) and cannot drift over time.

export { createGoogleAdsClient } from '@/lib/integrations/google_ads/client'
export type {
  GoogleAdsClient,
  CreateGoogleAdsClientInput,
} from '@/lib/integrations/google_ads/client'
export { GoogleAdsApiError } from '@/lib/integrations/google_ads/client'
