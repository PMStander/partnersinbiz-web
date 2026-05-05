import Link from 'next/link'
import { adminDb } from '@/lib/firebase/admin'
import { cookies } from 'next/headers'
import { adminAuth } from '@/lib/firebase/admin'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const PHASE_LABELS = ['Pre-launch', 'Foundation', 'Content', 'Authority', 'Compounding'] as const

async function currentUser(): Promise<{ uid: string; orgId?: string } | null> {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const session = cookieStore.get(cookieName)?.value
  if (!session) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    return { uid: decoded.uid, orgId: userDoc.data()?.orgId }
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadStats(sprintId: string): Promise<any> {
  const [tasksSnap, keywordsSnap, contentSnap, auditsSnap] = await Promise.all([
    adminDb.collection('seo_tasks').where('sprintId', '==', sprintId).where('deleted', '==', false).get(),
    adminDb.collection('seo_keywords').where('sprintId', '==', sprintId).where('deleted', '==', false).get(),
    adminDb.collection('seo_content').where('sprintId', '==', sprintId).where('deleted', '==', false).get(),
    adminDb.collection('seo_audits').where('sprintId', '==', sprintId).limit(20).get(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keywords = keywordsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = contentSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audits = auditsSnap.docs.map((d) => d.data() as any)

  const totalTasks = tasks.length
  const doneTasks = tasks.filter((t) => t.status === 'done').length
  const inFlightTasks = tasks.filter((t) => t.status === 'in_progress')
  const blockedTasks = tasks.filter((t) => t.status === 'blocked')
  const recentWins = tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt?.toMillis?.() ?? 0) - (a.completedAt?.toMillis?.() ?? 0))
    .slice(0, 5)

  const week7DaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const wonThisWeek = tasks.filter(
    (t) => t.status === 'done' && (t.completedAt?.toMillis?.() ?? 0) > week7DaysAgo,
  ).length

  const rankingKeywords = keywords.filter(
    (k) => k.status === 'ranking' || k.status === 'top_10' || k.status === 'top_3',
  ).length
  const topThree = keywords.filter((k) => k.status === 'top_3').length

  // Compute movers: keywords with biggest position improvement (lower = better) over last 2 pulls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const movers = keywords
    .map((k) => {
      const positions = (k.positions ?? []) as { position: number; pulledAt: string }[]
      if (positions.length < 2) return null
      const sorted = [...positions].sort(
        (a, b) => new Date(b.pulledAt).getTime() - new Date(a.pulledAt).getTime(),
      )
      const latest = sorted[0]
      const previous = sorted[1]
      const delta = previous.position - latest.position // positive = improved
      return { keyword: k.keyword, current: latest.position, delta, status: k.status }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null && m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)

  const liveContent = content.filter((c) => c.status === 'live').length

  const latestAudit = audits.sort(
    (a, b) => (b.snapshotDay ?? 0) - (a.snapshotDay ?? 0),
  )[0]

  return {
    totalTasks,
    doneTasks,
    pct: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
    inFlightCount: inFlightTasks.length,
    blockedCount: blockedTasks.length,
    wonThisWeek,
    rankingKeywords,
    topThree,
    totalKeywords: keywords.length,
    liveContent,
    totalContent: content.length,
    latestAudit,
    recentWins,
    movers,
  }
}

export default async function PortalSeoIndex() {
  const user = await currentUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = adminDb.collection('seo_sprints').where('deleted', '==', false)
  if (user.orgId) q = q.where('orgId', '==', user.orgId)
  const snap = await q.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprints = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))

  // ── Empty state ───────────────────────────────────────────────────────
  if (sprints.length === 0) {
    return (
      <div className="card p-12 text-center max-w-xl mx-auto">
        <span className="material-symbols-outlined text-[48px] text-[var(--color-pib-text-muted)] mb-3">
          trending_up
        </span>
        <h1 className="text-2xl font-semibold mb-3">SEO Sprint</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          Your team is preparing your 90-day SEO sprint. Once it&apos;s set up you&apos;ll see your daily plan,
          keyword movements, content drafts, and progress here.
        </p>
      </div>
    )
  }

  // ── Multi-sprint state (simple cards) ─────────────────────────────────
  if (sprints.length > 1) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Your SEO Sprints</h1>
          <p className="text-sm text-[var(--color-pib-text-muted)]">
            Track progress, performance, and impact over each 90-day plan.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {sprints.map((s: any) => {
            const day = s.currentDay ?? 0
            const phase = s.currentPhase ?? 0
            const signals = (s.health?.signals?.length ?? 0) as number
            return (
              <Link
                key={s.id}
                href={`/portal/seo/sprints/${s.id}`}
                className="card p-5 space-y-2 hover:border-gray-400"
              >
                <div className="text-xs text-[var(--color-pib-text-muted)]">
                  {phase === 4 ? `Compounding · Day ${day}` : `Day ${day} of 90`} · {PHASE_LABELS[phase]}
                </div>
                <h3 className="text-lg font-semibold">{s.siteName}</h3>
                <p className="text-xs text-[var(--color-pib-text-muted)] truncate">{s.siteUrl}</p>
                <p className="text-sm font-medium pt-2">
                  {signals === 0 ? '✓ All systems normal' : `${signals} attention items`}
                </p>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Single sprint hero dashboard ──────────────────────────────────────
  const sprint = sprints[0]
  const day = sprint.currentDay ?? 0
  const phase = sprint.currentPhase ?? 0
  const overallPct = phase === 4 ? 100 : Math.round((day / 90) * 100)
  const signals = sprint.health?.signals ?? []
  const stats = await loadStats(sprint.id)

  return (
    <div className="space-y-8">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="card p-8 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-pib-text-muted)]">
              SEO Sprint · {sprint.siteName}
            </p>
            <h1 className="text-3xl font-semibold">
              {phase === 4 ? `Phase 4 — Compounding · Day ${day}` : `Day ${day} of 90`}
            </h1>
            <p className="text-sm text-[var(--color-pib-text-muted)]">
              {PHASE_LABELS[phase]} · {sprint.siteUrl}
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold tabular-nums">{stats.pct}%</div>
            <div className="text-xs text-[var(--color-pib-text-muted)]">tasks complete</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-pib-text-muted)]">
            <span>{stats.doneTasks} of {stats.totalTasks} tasks done</span>
            <span>{phase === 4 ? 'Beyond Day 90' : `${overallPct}% through 90 days`}</span>
          </div>
          <div className="w-full h-2 bg-[var(--color-pib-line)] rounded-full overflow-hidden">
            <div
              className="h-2 bg-[var(--color-pib-accent)] rounded-full transition-all"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
        </div>
      </section>

      {/* ── Health banner (if any) ────────────────────────────────── */}
      {signals.length > 0 && (
        <section className="card p-5 border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-[20px]">notifications_active</span>
            <h3 className="font-semibold text-sm">{signals.length} thing{signals.length === 1 ? '' : 's'} need attention</h3>
          </div>
          <p className="text-xs text-[var(--color-pib-text-muted)]">
            The autoresearch loop has flagged signals worth investigating. Your team is on it.
          </p>
        </section>
      )}

      {/* ── Stats grid ────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Won this week"
          value={String(stats.wonThisWeek)}
          sub={`${stats.inFlightCount} in flight`}
          icon="task_alt"
        />
        <StatCard
          label="Keywords ranking"
          value={`${stats.rankingKeywords}/${stats.totalKeywords}`}
          sub={`${stats.topThree} in top 3`}
          icon="emoji_events"
        />
        <StatCard
          label="Content live"
          value={`${stats.liveContent}/${stats.totalContent}`}
          sub="Posts published"
          icon="article"
        />
        <StatCard
          label="Latest audit"
          value={stats.latestAudit?.score ? `${stats.latestAudit.score}` : '—'}
          sub={stats.latestAudit?.snapshotDay != null ? `Day ${stats.latestAudit.snapshotDay}` : 'Pending'}
          icon="health_and_safety"
        />
      </section>

      {/* ── Today + Movers + Wins ─────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's focus */}
        <div className="card p-5 space-y-3 lg:col-span-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">today</span>
            Today&apos;s focus
          </h3>
          <div className="space-y-2 text-sm">
            <Row label="In flight" value={stats.inFlightCount} accent={stats.inFlightCount > 0} />
            <Row label="Blocked" value={stats.blockedCount} accent={false} muted={stats.blockedCount === 0} />
            <Row label="Done this week" value={stats.wonThisWeek} accent={stats.wonThisWeek > 0} />
          </div>
          <Link
            href={`/portal/seo/sprints/${sprint.id}`}
            className="text-xs font-medium text-[var(--color-pib-accent-hover)] hover:underline inline-flex items-center gap-1 pt-1"
          >
            View today&apos;s plan
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>

        {/* Top movers */}
        <div className="card p-5 space-y-3 lg:col-span-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">trending_up</span>
            Top movers
          </h3>
          {stats.movers.length === 0 ? (
            <p className="text-xs text-[var(--color-pib-text-muted)]">
              No keyword movement yet. Rankings update daily after Search Console syncs.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {stats.movers.map((m: any) => (
                <li key={m.keyword} className="flex items-center justify-between">
                  <span className="truncate pr-2">{m.keyword}</span>
                  <span className="text-xs font-medium text-green-500 shrink-0">
                    +{m.delta} → #{m.current}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/portal/seo/sprints/${sprint.id}/keywords`}
            className="text-xs font-medium text-[var(--color-pib-accent-hover)] hover:underline inline-flex items-center gap-1 pt-1"
          >
            All keywords
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>

        {/* Recent wins */}
        <div className="card p-5 space-y-3 lg:col-span-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Recent wins
          </h3>
          {stats.recentWins.length === 0 ? (
            <p className="text-xs text-[var(--color-pib-text-muted)]">
              First wins will land here as tasks complete.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {stats.recentWins.map((t: any) => (
                <li key={t.id} className="flex items-start justify-between gap-3">
                  <span className="text-xs leading-relaxed">{t.title}</span>
                  <span className="text-[10px] text-[var(--color-pib-text-muted)] shrink-0 pt-0.5">
                    {t.completedAt?.toDate
                      ? new Date(t.completedAt.toDate()).toLocaleDateString('en-ZA', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Deep links ────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DeepLink href={`/portal/seo/sprints/${sprint.id}`} icon="today" label="Today's plan" />
        <DeepLink href={`/portal/seo/sprints/${sprint.id}/keywords`} icon="key" label="Keywords" />
        <DeepLink href={`/portal/seo/sprints/${sprint.id}/content`} icon="article" label="Content" />
        <DeepLink href={`/portal/seo/sprints/${sprint.id}/audits`} icon="health_and_safety" label="Audits" />
        <DeepLink href={`/portal/seo/sprints/${sprint.id}/pages`} icon="description" label="Pages" />
        <DeepLink href={`/portal/seo/sprints/${sprint.id}/blog`} icon="rss_feed" label="Blog drafts" />
        <DeepLink href={`/portal/seo/sprints/${sprint.id}/performance`} icon="speed" label="Performance" />
      </section>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-pib-text-muted)]">{label}</p>
        <span className="material-symbols-outlined text-[16px] text-[var(--color-pib-text-muted)] opacity-70">
          {icon}
        </span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-[var(--color-pib-text-muted)]">{sub}</p>
    </div>
  )
}

function Row({
  label,
  value,
  accent,
  muted,
}: {
  label: string
  value: number
  accent?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-[var(--color-pib-text-muted)]' : ''}>{label}</span>
      <span
        className={[
          'tabular-nums font-medium',
          accent ? 'text-[var(--color-pib-accent-hover)]' : '',
          muted ? 'text-[var(--color-pib-text-muted)]' : '',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

function DeepLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="card p-3 flex items-center gap-2 hover:border-gray-400 transition-colors"
    >
      <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-text-muted)]">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}
