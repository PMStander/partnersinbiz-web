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
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/admin/seo" className="text-xs text-[var(--color-pib-text-muted)] hover:underline">
          ← All sprints
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{sprint.siteName}</h1>
            <p className="text-sm text-[var(--color-pib-text-muted)]">{sprint.siteUrl}</p>
            <p className="text-sm mt-1">
              {phase === 4 ? `Phase 4 — Compounding · Day ${day}` : `Day ${day} of 90`} · {phaseLabels[phase]}
            </p>
          </div>
          <form action={`/api/v1/seo/sprints/${id}/run`} method="POST">
            <button
              formAction={`/api/v1/seo/sprints/${id}/run`}
              className="text-sm px-4 py-2 rounded bg-black text-white hover:bg-gray-800"
            >
              Run today&apos;s SEO
            </button>
          </form>
        </div>
      </header>
      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/seo/sprints/${id}${t.href}`}
            className="px-3 py-2 text-sm border-b-2 border-transparent hover:border-gray-300"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  )
}
