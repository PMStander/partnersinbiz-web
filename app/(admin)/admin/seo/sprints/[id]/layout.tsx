import Link from 'next/link'
import { adminDb } from '@/lib/firebase/admin'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'today', label: 'Today', href: '' },
  { key: 'tasks', label: 'Tasks', href: '/tasks' },
  { key: 'keywords', label: 'Keywords', href: '/keywords' },
  { key: 'backlinks', label: 'Backlinks', href: '/backlinks' },
  { key: 'content', label: 'Content', href: '/content' },
  { key: 'audits', label: 'Audits', href: '/audits' },
  { key: 'optimizations', label: 'Optimizations', href: '/optimizations' },
  { key: 'health', label: 'Health', href: '/health' },
  { key: 'settings', label: 'Settings', href: '/settings' },
]

export default async function SprintLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const snap = await adminDb.collection('seo_sprints').doc(id).get()
  if (!snap.exists) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprint = snap.data() as any

  const phase = sprint.currentPhase ?? 0
  const day = sprint.currentDay ?? 0
  const phaseLabels = ['Pre-launch', 'Foundation', 'Content', 'Authority', 'Compounding']

  return (
    <div className="space-y-8">
      <header className="pib-card !p-6 md:!p-7">
        <Link href="/admin/seo" className="text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          All sprints
        </Link>
        <div className="mt-5 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <p className="eyebrow">SEO Sprint</p>
            <h1 className="font-headline text-3xl md:text-4xl font-semibold mt-2 tracking-tight">{sprint.siteName}</h1>
            <p className="text-sm text-[var(--color-pib-text-muted)] mt-2">{sprint.siteUrl}</p>
            <p className="text-sm mt-3 text-[var(--color-pib-text)]">
              {phase === 4 ? `Phase 4 — Compounding · Day ${day}` : `Day ${day} of 90`} · {phaseLabels[phase]}
            </p>
          </div>
          <form action={`/api/v1/seo/sprints/${id}/run`} method="POST">
            <button
              formAction={`/api/v1/seo/sprints/${id}/run`}
              className="pib-btn-primary"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              Run today&apos;s SEO
            </button>
          </form>
        </div>
      </header>
      <nav className="pib-card !p-2 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/seo/sprints/${id}${t.href}`}
            className="px-3 py-2 text-sm rounded-md text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-[var(--color-pib-surface-2)] whitespace-nowrap transition-colors"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  )
}
