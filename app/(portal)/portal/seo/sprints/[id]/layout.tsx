import Link from 'next/link'
import { adminDb } from '@/lib/firebase/admin'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'progress', label: 'Progress', href: '' },
  { key: 'performance', label: 'Performance', href: '/performance' },
  { key: 'pages', label: 'Pages', href: '/pages' },
  { key: 'blog', label: 'Blog', href: '/blog' },
  { key: 'keywords', label: 'Keywords', href: '/keywords' },
  { key: 'content', label: 'Content', href: '/content' },
  { key: 'audits', label: 'Audits', href: '/audits' },
]

export default async function PortalSprintLayout({
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
  const day = sprint.currentDay ?? 0
  const phase = sprint.currentPhase ?? 0

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/portal/seo" className="text-xs text-[var(--color-pib-text-muted)] hover:underline">
          ← All sprints
        </Link>
        <h1 className="text-2xl font-semibold">{sprint.siteName}</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">{sprint.siteUrl}</p>
        <p className="text-sm font-medium pt-1">
          {phase === 4 ? `Phase 4 · Compounding · Day ${day}` : `Day ${day} of 90`}
        </p>
      </header>
      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/portal/seo/sprints/${id}${t.href}`}
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
