import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function PortalProgressTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tasksSnap = await adminDb
    .collection('seo_tasks')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const inFlight = tasks.filter((t) => t.status === 'in_progress')
  const recent = tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt?.toMillis?.() ?? 0) - (a.completedAt?.toMillis?.() ?? 0))
    .slice(0, 10)

  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="text-3xl font-bold">{done} of {total}</div>
        <div className="text-sm text-[var(--color-pib-text-muted)]">tasks complete · {pct}%</div>
        <div className="mt-3 w-full h-2 bg-gray-100 rounded">
          <div className="h-2 bg-black rounded" style={{ width: `${pct}%` }} />
        </div>
      </section>
      <section className="card p-5">
        <h3 className="font-semibold text-sm mb-3">In flight ({inFlight.length})</h3>
        {inFlight.length === 0 ? (
          <p className="text-xs text-[var(--color-pib-text-muted)]">Nothing in flight right now.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {inFlight.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="card p-5">
        <h3 className="font-semibold text-sm mb-3">Recent activity</h3>
        {recent.length === 0 ? (
          <p className="text-xs text-[var(--color-pib-text-muted)]">No completed tasks yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recent.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span>{t.title}</span>
                <span className="text-xs text-[var(--color-pib-text-muted)]">
                  {t.completedAt?.toDate ? new Date(t.completedAt.toDate()).toLocaleDateString() : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
