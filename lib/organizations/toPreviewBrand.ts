import type { PreviewBrand } from '@/components/campaign-preview/types'
import type { BrandProfile } from './types'

/**
 * Permissive shape — `OrgSettings.brandColors` in types.ts only declares
 * primary/secondary/accent, but the brand admin page saves additional keys
 * (background, surface, text, textMuted, border, success, warning, error).
 */
export interface BrandColorsLike {
  primary?: string
  secondary?: string
  accent?: string
  background?: string
  surface?: string
  text?: string
  textMuted?: string
  border?: string
  success?: string
  warning?: string
  error?: string
}

/**
 * Map an org's stored brand into the campaign-preview `PreviewBrand` shape.
 * Returns `undefined` when there's nothing usable so AssetGrid + cards fall
 * back to their defaults rather than rendering with empty strings.
 */
export function toPreviewBrand(
  brandColors: BrandColorsLike | undefined,
  brandProfile: BrandProfile | undefined,
  orgName?: string,
): PreviewBrand | undefined {
  const accent = brandColors?.accent ?? brandColors?.primary
  if (!accent && !brandProfile?.logoUrl && !orgName) return undefined

  const palette: PreviewBrand['palette'] = {
    bg: brandColors?.background ?? '#0A0A0B',
    accent: accent ?? '#F5A623',
    alert: brandColors?.warning ?? brandColors?.error ?? '#F59E0B',
    text: brandColors?.text ?? '#EDEDED',
    muted: brandColors?.textMuted,
  }

  const typography = brandProfile?.fonts
    ? {
        heading: brandProfile.fonts.heading,
        body: brandProfile.fonts.body,
      }
    : undefined

  return {
    name: orgName,
    palette,
    typography,
    logoUrl: brandProfile?.logoUrl,
  }
}
