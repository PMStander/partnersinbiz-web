import type { CSSProperties, ReactNode } from 'react'
import type { DocumentTheme as DocumentThemeType } from '@/lib/client-documents/types'

const DEFAULTS = {
  bg: '#0A0A0B',
  text: '#F7F4EE',
  accent: '#F5A623',
  muted: '#888888',
  border: '#222222',
  surface: '#141416',
} as const

function pick(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback
}

/** Add a `#RRGGBB` alpha suffix. Falls back to original if non-hex. */
function withAlpha(color: string, alpha01: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const a = Math.round(alpha01 * 255).toString(16).padStart(2, '0')
  return `#${m[1]}${a}`.toLowerCase()
}

export function DocumentTheme({
  palette,
  children,
  className,
}: {
  palette?: DocumentThemeType['palette']
  children: ReactNode
  className?: string
}) {
  const bg = pick(palette?.bg, DEFAULTS.bg)
  const text = pick(palette?.text, DEFAULTS.text)
  const accent = pick(palette?.accent, DEFAULTS.accent)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const muted = pick((palette as any)?.muted, DEFAULTS.muted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const border = pick((palette as any)?.border, DEFAULTS.border)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const surface = pick((palette as any)?.surface, DEFAULTS.surface)

  const style: CSSProperties = {
    '--doc-bg': bg,
    '--doc-text': text,
    '--doc-accent': accent,
    '--doc-accent-soft': withAlpha(accent, 0.15),
    '--doc-accent-strong': accent,
    '--doc-muted': muted,
    '--doc-border': border,
    '--doc-surface': surface,
    background: bg,
    color: text,
  } as CSSProperties

  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}
