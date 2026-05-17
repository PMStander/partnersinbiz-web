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
      <div className="pib-card p-6">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[22px] text-[var(--color-pib-accent)]">event_busy</span>
          <div>
            <h2 className="font-headline text-lg font-semibold">Today&apos;s plan is pending</h2>
            <p className="text-sm text-[var(--color-pib-text-muted)] mt-2">
              The daily cron at 06:00 SAST will populate it, or run a daily pull manually.
            </p>
          </div>
        </div>
        <code className="block mt-5 text-xs rounded-md border border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)] p-3">
          POST /api/v1/seo/integrations/gsc/pull/{id}
        </code>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatTile label="Due" value={String(due.length)} icon="assignment" />
        <StatTile label="In progress" value={String(inProgress.length)} icon="autorenew" />
        <StatTile label="Blocked" value={String(blocked.length)} icon="block" />
        <StatTile label="Proposals" value={String(optimizations)} icon="tips_and_updates" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title={`Due (${due.length})`} tasks={due} emptyMsg="Nothing due this week" icon="assignment" />
        <Section title={`In progress (${inProgress.length})`} tasks={inProgress} emptyMsg="No tasks in flight" icon="autorenew" />
        <Section title={`Blocked (${blocked.length})`} tasks={blocked} emptyMsg="No blockers" icon="block" />
        <div className="pib-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow !text-[10px]">Optimization loop</p>
              <h3 className="font-headline text-lg font-semibold mt-1">Optimization proposals</h3>
            </div>
            <span className="material-symbols-outlined text-[22px] text-[var(--color-pib-accent)]">tips_and_updates</span>
          </div>
          <p className="text-3xl font-display tabular-nums">{optimizations}</p>
          <p className="text-xs text-[var(--color-pib-text-muted)]">
            See the Optimizations tab to approve, reject, or convert proposals into tasks.
          </p>
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="pib-stat-card">
      <div className="flex items-start justify-between">
        <p className="eyebrow !text-[10px]">{label}</p>
        <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-text-muted)]">{icon}</span>
      </div>
      <p className="mt-3 font-display tracking-tight leading-none text-3xl">{value}</p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Section({ title, tasks, emptyMsg, icon }: { title: string; tasks: any[]; emptyMsg: string; icon: string }) {
  return (
    <div className="pib-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-headline text-lg font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[var(--color-pib-accent)]">{icon}</span>
          {title}
        </h3>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          {emptyMsg}
        </p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)] p-3">
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-[var(--color-pib-text-muted)]">
                Week {t.week} · {t.focus} · {t.taskType}
                {t.autopilotEligible && ' · autopilot-eligible'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
