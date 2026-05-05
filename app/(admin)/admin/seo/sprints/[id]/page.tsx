import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export default async function TodayTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sprintSnap = await adminDb.collection('seo_sprints').doc(id).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprint = sprintSnap.data() as any
  const plan = sprint?.todayPlan

  // Resolve task IDs to titles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function loadTasks(ids: string[]): Promise<any[]> {
    if (!ids?.length) return []
    const docs = await Promise.all(ids.map((tid) => adminDb.collection('seo_tasks').doc(tid).get()))
    return docs.filter((d) => d.exists).map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
  }

  const due = await loadTasks(plan?.due ?? [])
  const inProgress = await loadTasks(plan?.inProgress ?? [])
  const blocked = await loadTasks((plan?.blocked ?? []).map((b: { taskId: string }) => b.taskId))
  const optimizations = (plan?.optimizationProposals ?? []).length

  if (!plan) {
    return (
      <div className="card p-6">
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          Today&apos;s plan hasn&apos;t been computed yet. The daily cron at 06:00 SAST will populate it, or
          run a daily pull manually:
        </p>
        <code className="block mt-3 text-xs">
          POST /api/v1/seo/integrations/gsc/pull/{id}
        </code>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Section title={`Due (${due.length})`} tasks={due} emptyMsg="Nothing due this week 🎉" />
      <Section title={`In progress (${inProgress.length})`} tasks={inProgress} emptyMsg="No tasks in flight" />
      <Section title={`Blocked (${blocked.length})`} tasks={blocked} emptyMsg="No blockers" />
      <div className="card p-5 space-y-2">
        <h3 className="font-semibold text-sm">Optimization proposals ({optimizations})</h3>
        <p className="text-xs text-[var(--color-pib-text-muted)]">
          See the Optimizations tab to review and approve/reject.
        </p>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Section({ title, tasks, emptyMsg }: { title: string; tasks: any[]; emptyMsg: string }) {
  return (
    <div className="card p-5 space-y-3">
      <h3 className="font-semibold text-sm">{title}</h3>
      {tasks.length === 0 ? (
        <p className="text-xs text-[var(--color-pib-text-muted)]">{emptyMsg}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="text-sm border-b last:border-0 pb-2">
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-[var(--color-pib-text-muted)]">
                Week {t.week} · {t.focus} · {t.taskType}
                {t.autopilotEligible && ' · 🤖 autopilot-eligible'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
