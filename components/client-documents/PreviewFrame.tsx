'use client'

import Link from 'next/link'
import { useEffect, type ReactNode } from 'react'

export function PreviewFrame({
  backHref,
  versionLabel,
  shareUrl,
  children,
}: {
  backHref: string
  versionLabel: string
  shareUrl?: string
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        window.location.href = backHref
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [backHref])

  return (
    <>
      <div className="fixed left-4 top-4 z-50">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur hover:bg-black/85"
        >
          <span aria-hidden>←</span> Back to editor
        </Link>
      </div>
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <span className="rounded-full bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
          {versionLabel}
        </span>
        {shareUrl && (
          <Link
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[var(--color-pib-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black hover:bg-[var(--color-pib-accent-hover)]"
          >
            Open public share →
          </Link>
        )}
      </div>
      {children}
    </>
  )
}
