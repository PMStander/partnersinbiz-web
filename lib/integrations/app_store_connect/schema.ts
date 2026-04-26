// lib/integrations/app_store_connect/schema.ts
//
// Types for the Apple Sales Reports gzipped TSV payload.
// The TSV column order is documented at:
//   https://developer.apple.com/help/app-store-connect/reference/sales-and-trends-reports
//
// The Sales Reports endpoint we hit is:
//   GET https://api.appstoreconnect.apple.com/v1/salesReports
//   ?filter[frequency]=DAILY
//   &filter[reportSubType]=SUMMARY
//   &filter[reportType]=SALES
//   &filter[vendorNumber]=...
//   &filter[reportDate]=YYYY-MM-DD
//
// Response is `application/a-gzip` — gunzip then split on "\n", then split rows
// by "\t". The first row is the header.

/** Documented header columns (order matters). Apple may add columns; we look up by name. */
export const ASC_SALES_HEADERS = [
  'Provider',
  'Provider Country',
  'SKU',
  'Developer',
  'Title',
  'Version',
  'Product Type Identifier',
  'Units',
  'Developer Proceeds',
  'Begin Date',
  'End Date',
  'Customer Currency',
  'Country Code',
  'Currency of Proceeds',
  'Apple Identifier',
  'Customer Price',
  'Promo Code',
  'Parent Identifier',
  'Subscription',
  'Period',
  'Category',
  'CMB',
  'Device',
  'Supported Platforms',
  'Proceeds Reason',
  'Preserved Pricing',
  'Client',
  'Order Type',
] as const

export type AscSalesHeader = (typeof ASC_SALES_HEADERS)[number]

/** A normalised parsed row from the Sales Report TSV. */
export interface AscSalesRow {
  provider: string
  providerCountry: string
  sku: string
  developer: string
  title: string
  version: string
  /** Product type identifier — drives the metric category (install / IAP / subscription). */
  productTypeIdentifier: string
  units: number
  /** Per-row developer proceeds. Apple already deducts their share. */
  developerProceeds: number
  beginDate: string
  endDate: string
  customerCurrency: string
  countryCode: string
  /** Currency the developerProceeds figure is denominated in. */
  currencyOfProceeds: string
  /** Apple's numeric app identifier — matches Property.config.revenue.appStoreAppId. */
  appleIdentifier: string
  customerPrice: number
  promoCode: string
  parentIdentifier: string
  subscription: string
  period: string
  category: string
  cmb: string
  device: string
  supportedPlatforms: string
  proceedsReason: string
  preservedPricing: string
  client: string
  orderType: string
  /** Original raw row for debug / audit. */
  raw: Record<string, string>
}

/* ─────────────────────────────────────────────────────────────────────────
 * Product Type Identifiers (App Store Connect)
 *
 * - First-time app downloads (count toward `installs`):
 *     '1'   = New iOS app download
 *     '1F'  = Universal app first download
 *     '1T'  = iPad-only first download
 *     '1E'  = Mac app first download
 *     '1EP' = Mac iPad app first download
 *     '1EU' = Universal Mac/iPad first download
 *     '1M'  = Mac OS app
 *
 * - In-app purchases (count toward `iap_revenue`):
 *     '1001'   = Auto-renewable subscription (paid)
 *     '1002'   = Free subscription (no proceeds, but counted)
 *     '1003'   = Subscription renewal
 *     'IA1'    = In-app purchase (consumable / non-consumable)
 *     'IA1-M'  = Mac in-app purchase
 *     'IA1-SP' = Mac subscription in-app purchase
 *     'IAY'    = Yearly subscription
 *     'IAC'    = Subscription content
 *     'IS1'    = Subscription
 *
 * Anything starting with 'IA' or in the explicit IAP list is treated as IAP.
 *
 * Reference:
 *   https://help.apple.com/app-store-connect/#/dev2cd126805
 *   https://help.apple.com/app-store-connect/#/itc04ae031c0
 * ─────────────────────────────────────────────────────────────────────────── */

export const INSTALL_PRODUCT_TYPES: ReadonlySet<string> = new Set([
  '1',
  '1F',
  '1T',
  '1E',
  '1EP',
  '1EU',
  '1M',
])

export const IAP_PRODUCT_TYPES_EXPLICIT: ReadonlySet<string> = new Set([
  '1001',
  '1002',
  '1003',
  'IA1',
  'IA1-M',
  'IA1-SP',
  'IAY',
  'IAC',
  'IS1',
])

/** True when the product type identifier marks a first-time app install. */
export function isInstallProductType(pti: string): boolean {
  return INSTALL_PRODUCT_TYPES.has(pti)
}

/** True when the product type identifier marks an in-app purchase / subscription. */
export function isIapProductType(pti: string): boolean {
  if (IAP_PRODUCT_TYPES_EXPLICIT.has(pti)) return true
  // Any 'IA*' identifier is an in-app purchase variant.
  return pti.startsWith('IA')
}

/** Encrypted credentials shape the adapter persists via `upsertConnection`. */
export interface AscCredentials {
  /** App Store Connect API key id (10-char). */
  keyId: string
  /** App Store Connect issuer id (UUID). */
  issuerId: string
  /** PEM-encoded ES256 private key (`-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----`). */
  privateKey: string
}

/** Non-secret meta persisted on the Connection. */
export interface AscMeta {
  /** Apple vendor / sales team number. Required for Sales Reports. */
  vendorNumber: string
}
