import type { Organization } from '@/lib/organizations/types'
import type { DocumentTheme } from './types'

const DEFAULTS: DocumentTheme = {
  palette: {
    bg: '#0A0A0B',
    text: '#F7F4EE',
    accent: '#F5A623',
    muted: '#888888',
  },
  typography: {
    heading: 'sans-serif',
    body: 'sans-serif',
  },
}

/**
 * Build a DocumentTheme from an organization's brand colors.
 *
 * The Organization.settings.brandColors interface in types.ts only declares
 * `primary | secondary | accent` strictly, but in practice older callers and
 * brand-kit writes also populate `background`, `text`, and `textMuted`.
 * Read both shapes so we get the right colors regardless of which version of
 * the brand kit wrote the data.
 *
 * Returns null when org is null so callers can compose `themeFromOrg(org) ??
 * fallback` patterns.
 */
export function themeFromOrg(org: Organization | null): DocumentTheme | null {
  if (!org) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand: any = (org.settings as any)?.brandColors ?? {}
  return {
    brandName: org.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logoUrl: (org.settings as any)?.logoUrl ?? org.logoUrl,
    palette: {
      bg: brand.background || DEFAULTS.palette.bg,
      text: brand.text || DEFAULTS.palette.text,
      accent: brand.accent || brand.primary || DEFAULTS.palette.accent,
      muted: brand.textMuted || DEFAULTS.palette.muted,
    },
    typography: DEFAULTS.typography,
  }
}
