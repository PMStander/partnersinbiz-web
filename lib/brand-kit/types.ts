// lib/brand-kit/types.ts
//
// Centralized brand identity per organisation. One doc at
// `brand_kits/{orgId}`. Used by the email builder (apply colors / fonts /
// footer defaults to new templates) and the AI generators (brandVoiceId
// picks one of lib/ai/voice-presets.ts).
//
// Anything optional is intentionally optional — partial kits are valid
// and the helpers fall back to defaults.

import type { Timestamp } from 'firebase-admin/firestore'
import type { BrandVoice } from '@/lib/ai/email-generators'

export interface BrandKitSocial {
  twitter?: string
  linkedin?: string
  instagram?: string
  facebook?: string
  youtube?: string
  tiktok?: string
}

export interface BrandKit {
  orgId: string

  // Identity
  brandName: string
  logoUrl: string                  // hosted via email-images upload
  logoUrlDark: string              // optional dark-mode variant ("" if unset)
  faviconUrl?: string

  // Color palette (hex)
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  textColor: string
  mutedTextColor: string

  // Typography
  fontFamilyPrimary: string        // CSS font-family stack
  fontFamilyHeadings: string
  fontSizeBase: number             // 14 or 16

  // Email defaults
  defaultFromName: string
  defaultFromLocal: string         // local-part of default From, e.g. "hello"
  defaultReplyTo: string

  // CAN-SPAM compliance — printed in every footer block by default.
  postalAddress: string

  // Social links (rendered in footer block when present)
  social: BrandKitSocial

  // Tone / voice — links to a preset id from lib/ai/voice-presets.ts.
  // When `customVoice` is set, it overrides the preset.
  brandVoiceId?: string
  customVoice?: BrandVoice

  updatedAt: Timestamp | null
}

// Input shape from the API — same as BrandKit minus server-managed fields.
export type BrandKitInput = Omit<BrandKit, 'updatedAt'>

// Wire-shape (createdAt/updatedAt as ISO strings) for client consumption.
export interface BrandKitWire extends Omit<BrandKit, 'updatedAt'> {
  updatedAt: string | null
}

const SYSTEM_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

/**
 * Sensible defaults — used when no brand_kits doc exists yet for an org.
 * Colors match the PiB platform defaults so unbranded sends still look
 * coherent.
 */
export function defaultBrandKit(orgId: string): BrandKit {
  return {
    orgId,
    brandName: '',
    logoUrl: '',
    logoUrlDark: '',
    faviconUrl: undefined,
    primaryColor: '#F5A623',
    secondaryColor: '#0A0A0B',
    accentColor: '#F5A623',
    backgroundColor: '#F4F4F5',
    textColor: '#0A0A0B',
    mutedTextColor: '#52525B',
    fontFamilyPrimary: SYSTEM_FONT,
    fontFamilyHeadings: SYSTEM_FONT,
    fontSizeBase: 16,
    defaultFromName: '',
    defaultFromLocal: 'hello',
    defaultReplyTo: '',
    postalAddress: '',
    social: {},
    brandVoiceId: undefined,
    customVoice: undefined,
    updatedAt: null,
  }
}
