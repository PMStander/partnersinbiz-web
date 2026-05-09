'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { PreviewBrand } from '@/components/campaign-preview/types'
import type { Organization } from '@/lib/organizations/types'
import {
  toPreviewBrand,
  type BrandColorsLike,
} from '@/lib/organizations/toPreviewBrand'

interface OrgThemedFrameValue {
  org: Organization | null
  brand: PreviewBrand | undefined
  brandColors: BrandColorsLike | undefined
  loading: boolean
}

const Ctx = createContext<OrgThemedFrameValue>({
  org: null,
  brand: undefined,
  brandColors: undefined,
  loading: true,
})

export function useOrgBrand(): OrgThemedFrameValue {
  return useContext(Ctx)
}

export function OrgThemedFrame({
  orgId,
  children,
  className = '',
}: {
  orgId: string | null
  children: ReactNode
  className?: string
}) {
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) {
      setOrg(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/v1/organizations/${orgId}`)
      .then(r => r.json())
      .then(body => {
        if (cancelled) return
        setOrg((body?.data ?? null) as Organization | null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const brandColors = (org?.settings?.brandColors ?? undefined) as
    | BrandColorsLike
    | undefined
  const brand = useMemo(
    () => toPreviewBrand(brandColors, org?.brandProfile),
    [brandColors, org?.brandProfile],
  )

  // Inline CSS-var injection scoped to this wrapper. Defaults preserved via
  // var() fallback chains, so missing colours don't break anything.
  const styleVars: CSSProperties = brandColors
    ? ({
        '--org-bg': brandColors.background ?? 'var(--color-pib-bg)',
        '--org-surface': brandColors.surface ?? 'var(--color-pib-surface)',
        '--org-accent':
          brandColors.accent ?? brandColors.primary ?? 'var(--color-pib-accent)',
        '--org-accent-soft':
          brandColors.accent ?? brandColors.primary ?? 'var(--color-pib-accent)',
        '--org-text': brandColors.text ?? 'var(--color-pib-text)',
        '--org-text-muted':
          brandColors.textMuted ?? 'var(--color-pib-text-muted)',
        '--org-border': brandColors.border ?? 'var(--color-pib-line)',
      } as CSSProperties)
    : {}

  return (
    <Ctx.Provider value={{ org, brand, brandColors, loading }}>
      <div
        className={className}
        style={{
          ...styleVars,
          // Subtle accent tint backdrop. Falls back to default when no brand.
          backgroundImage: brandColors
            ? `radial-gradient(1100px 480px at 0% -10%, ${withAlpha(
                (brandColors.accent ?? brandColors.primary ?? '#F5A623') as string,
                0.08,
              )} 0%, transparent 60%)`
            : undefined,
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}

/** Adds an alpha channel to a #RRGGBB hex. Falls back to the original string. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${m[1]}${a}`
}
