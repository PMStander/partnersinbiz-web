// lib/onboarding/products.ts
// Registry of all products available via /start/[product].
// Add new products here as you expand beyond Athleet.

export interface ProductMeta {
  slug:        string   // matches the [product] URL param
  name:        string   // display name
  tagline:     string   // short description shown on the form page
  description: string   // longer pitch copy
  priceLabel:  string   // e.g. "One-time setup · from $299"
  features:    string[] // bullet list of what's included
  color:       string   // brand accent color for this product card
}

export const PRODUCTS: Record<string, ProductMeta> = {
  'athleet-management': {
    slug:        'athleet-management',
    name:        'Athleet Management',
    tagline:     'The all-in-one club management platform for sports coaches.',
    description: 'A fully branded, custom-configured management portal for your club — athlete records, registrations, scheduling, payments, and a professional public-facing website. One-time setup, no recurring SaaS fees.',
    priceLabel:  'One-time setup · from $299',
    features: [
      'Custom branded website with your club name, logo & colors',
      'Athlete registration & management portal',
      'Training schedules & session management',
      'Financial tracking & invoice generation',
      'Parent & athlete portals with secure login',
      'Match records & performance tracking',
      'Email communications & notifications',
      'Admin dashboard with full club control',
    ],
    color: '#ffffff',
  },
  // Future products — uncomment and fill in when ready:
  // 'loyalty-plus': {
  //   slug:     'loyalty-plus',
  //   name:     'Loyalty Plus',
  //   ...
  // },
}

export function getProduct(slug: string): ProductMeta | null {
  return PRODUCTS[slug] ?? null
}
