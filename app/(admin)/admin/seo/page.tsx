import Link from 'next/link'
import { adminDb } from '@/lib/firebase/admin'
import { SprintCard } from '@/components/seo/SprintCard'
import { PipPresencePill } from '@/components/seo/PipPresencePill'

export const dynamic = 'force-dynamic'

export default async function SeoIndexPage() {
  const snap = await adminDb.collection('seo_sprints').where('deleted', '==', false).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprints = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  // Newest first
  sprints.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0
    const bt = b.createdAt?.toMillis?.() ?? 0
    return bt - at
  })

  // Find any sprint's lastPullAt for the presence pill
  const lastRun = sprints
    .map((s) => s.integrations?.gsc?.lastPullAt)
    .filter(Boolean)
    .sort()
    .pop()

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SEO Sprints</h1>
          <p className="text-sm text-[var(--color-pib-text-muted)]">
            90-day sprints per client site. Daily pulls + weekly optimization loop.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PipPresencePill lastRunAt={lastRun?.toDate?.()?.toISOString?.() ?? null} />
          <Link
            href="/admin/seo/sprints/new"
            className="text-sm px-4 py-2 rounded bg-black text-white hover:bg-gray-800"
          >
            + New Sprint
          </Link>
          <Link href="/admin/seo/tools" className="text-sm px-4 py-2 rounded border hover:bg-gray-50">
            Tools
          </Link>
        </div>
      </header>
      {sprints.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[var(--color-pib-text-muted)] mb-4">No sprints yet.</p>
          <Link
            href="/admin/seo/sprints/new"
            className="text-sm px-4 py-2 rounded bg-black text-white hover:bg-gray-800"
          >
            Create the first sprint
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sprints.map((s) => (
            <SprintCard key={s.id} sprint={s} />
          ))}
        </div>
      )}
    </div>
  )
}
