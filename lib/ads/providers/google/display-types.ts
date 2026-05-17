// lib/ads/providers/google/display-types.ts
// RDA (Responsive Display Ad) asset types + validator.
// Additive — Sub-3a Phase 3 Batch 1.

export interface RdaAssets {
  marketingImages: string[]           // 1-15 image URLs or 'customers/{cid}/assets/{id}' resource names
  squareMarketingImages: string[]     // 1-15 square images
  logoImages?: string[]               // 0-5 landscape logos
  squareLogoImages?: string[]         // 0-5 square logos
  headlines: string[]                 // 1-5 short headlines (30 chars max)
  longHeadlines: string[]             // 1-5 long headlines (90 chars max)
  descriptions: string[]             // 1-5 descriptions (90 chars max)
  businessName: string                // required
  finalUrls: string[]                 // 1+ landing URLs
  callToActionText?:
    | 'APPLY_NOW' | 'BOOK_NOW' | 'CONTACT_US' | 'DOWNLOAD'
    | 'LEARN_MORE' | 'SHOP_NOW' | 'SIGN_UP' | 'SUBSCRIBE'
}

export function validateRdaAssets(assets: RdaAssets): void {
  if (assets.marketingImages.length < 1 || assets.marketingImages.length > 15) {
    throw new Error(`RDA requires 1-15 marketing images, got ${assets.marketingImages.length}`)
  }
  if (assets.squareMarketingImages.length < 1 || assets.squareMarketingImages.length > 15) {
    throw new Error(`RDA requires 1-15 square marketing images, got ${assets.squareMarketingImages.length}`)
  }
  if (assets.logoImages && assets.logoImages.length > 5) {
    throw new Error(`RDA allows 0-5 logo images, got ${assets.logoImages.length}`)
  }
  if (assets.squareLogoImages && assets.squareLogoImages.length > 5) {
    throw new Error(`RDA allows 0-5 square logo images, got ${assets.squareLogoImages.length}`)
  }
  if (assets.headlines.length < 1 || assets.headlines.length > 5) {
    throw new Error(`RDA requires 1-5 headlines, got ${assets.headlines.length}`)
  }
  if (assets.longHeadlines.length < 1 || assets.longHeadlines.length > 5) {
    throw new Error(`RDA requires 1-5 long headlines, got ${assets.longHeadlines.length}`)
  }
  if (assets.descriptions.length < 1 || assets.descriptions.length > 5) {
    throw new Error(`RDA requires 1-5 descriptions, got ${assets.descriptions.length}`)
  }
  if (!assets.businessName.trim()) throw new Error('RDA businessName is required')
  if (assets.finalUrls.length === 0) throw new Error('RDA requires at least one finalUrl')

  for (const h of assets.headlines) {
    if (!h.trim()) throw new Error('RDA headline cannot be empty')
    if (h.length > 30) throw new Error(`RDA headline > 30 chars: "${h}"`)
  }
  for (const h of assets.longHeadlines) {
    if (!h.trim()) throw new Error('RDA long headline cannot be empty')
    if (h.length > 90) throw new Error(`RDA long headline > 90 chars: "${h}"`)
  }
  for (const d of assets.descriptions) {
    if (!d.trim()) throw new Error('RDA description cannot be empty')
    if (d.length > 90) throw new Error(`RDA description > 90 chars: "${d}"`)
  }
}
