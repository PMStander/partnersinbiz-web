import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  blocked: 'bg-red-100 text-red-800',
  done: 'bg-green-100 text-green-800',
  skipped: 'bg-amber-100 text-amber-800',
  na: 'bg-gray-100 text-gray-500',
}

export default async function TasksTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb
    .collection('seo_tasks')
    .where('sprintId', '==', id)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  tasks.sort((a, b) => a.week - b.week || a.phase - b.phase)

  // Group by week
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byWeek: Record<number, any[]> = {}
  for (const t of tasks) {
    byWeek[t.week] ??= []
    byWeek[t.week].push(t)
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Tasks ({tasks.length})</h2>
        <p className="text-xs text-[var(--color-pib-text-muted)]">
          {tasks.filter((t) => t.status === 'done').length} done ·{' '}
          {tasks.filter((t) => t.status === 'in_progress').length} in flight ·{' '}
          {tasks.filter((t) => t.status === 'blocked').length} blocked
        </p>
      </header>

      {Object.entries(byWeek).map(([week, items]) => (
        <div key={week} className="space-y-2">
          <h3 className="text-sm font-medium">Week {week}</h3>
          <div className="card divide-y">
            {items.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[t.status] ?? STATUS_COLORS.not_started}`}>
                  {t.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-[var(--color-pib-text-muted)]">
                    {t.focus} · {t.taskType}
                    {t.autopilotEligible && ' · 🤖'}
                    {t.source === 'optimization' && ' · 🧪 optimization'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
