import Link from 'next/link'

export default function PortalAdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/portal/marketing"
            className="text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)]"
          >
            ← Marketing
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-pib-text)]">Ads</h1>
          <p className="text-sm text-[var(--color-pib-text-muted)]">
            Your live Meta ad campaigns and any drafts awaiting your review.
          </p>
        </div>
        <Link
          href="/portal/ads/activity"
          className="shrink-0 mt-1 text-xs text-[var(--color-pib-accent)] hover:text-[var(--color-pib-accent-hover)]"
        >
          Activity →
        </Link>
      </header>
      {children}
    </div>
  )
}
