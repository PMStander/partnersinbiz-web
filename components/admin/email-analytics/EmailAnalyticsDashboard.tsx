'use client'

// components/admin/email-analytics/EmailAnalyticsDashboard.tsx
//
// The main client-side dashboard. Owns date range, tab state, and the four
// data fetches (overview, timeseries, contacts, leaderboard).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LineChart, BarChart, Donut } from './charts'
import type {
  OrgEmailOverview,
  EngagementTimeseries,
  ContactEngagement,
  OrgComparisonRow,
} from '@/lib/email-analytics/aggregate'

type TabKey = 'overview' | 'engagement' | 'broadcasts' | 'leaderboard'

const TABS: Array<{ key: TabKey; label: string; adminOnly?: boolean }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'broadcasts', label: 'Broadcasts' },
  { key: 'leaderboard', label: 'Leaderboard', adminOnly: true },
]

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export default function EmailAnalyticsDashboard({
  orgId,
  isAdmin,
}: {
  orgId: string
  isAdmin: boolean
}) {
  const today = useMemo(() => new Date(), [])
  const thirtyDaysAgo = useMemo(
    () => new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
    [today],
  )
  const [from, setFrom] = useState<string>(isoDate(thirtyDaysAgo))
  const [to, setTo] = useState<string>(isoDate(today))
  const [tab, setTab] = useState<TabKey>('overview')

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-on-surface">Email Analytics</h1>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-on-surface-variant">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1 rounded-lg border border-outline-variant bg-surface text-on-surface"
          />
          <label className="text-on-surface-variant">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1 rounded-lg border border-outline-variant bg-surface text-on-surface"
          />
        </div>
      </div>

      <div className="flex gap-1 border-b border-outline-variant">
        {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'text-on-surface border-b-2 border-amber-500'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab orgId={orgId} from={from} to={to} />}
      {tab === 'engagement' && <EngagementTab orgId={orgId} />}
      {tab === 'broadcasts' && <BroadcastsTab orgId={orgId} from={from} to={to} />}
      {tab === 'leaderboard' && isAdmin && <LeaderboardTab from={from} to={to} />}
    </div>
  )
}

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ orgId, from, to }: { orgId: string; from: string; to: string }) {
  const [state, setState] = useState<{
    overview: OrgEmailOverview | null
    series: EngagementTimeseries | null
    loading: boolean
    key: string
  }>({ overview: null, series: null, loading: true, key: '' })

  useEffect(() => {
    const key = `${orgId}|${from}|${to}`
    const fromIso = new Date(from).toISOString()
    const toIso = new Date(`${to}T23:59:59.999Z`).toISOString()
    let cancelled = false
    Promise.all([
      fetch(`/api/v1/email-analytics/overview?orgId=${orgId}&from=${fromIso}&to=${toIso}`).then((r) => r.json()),
      fetch(`/api/v1/email-analytics/timeseries?orgId=${orgId}&from=${fromIso}&to=${toIso}&bucket=day`).then((r) => r.json()),
    ]).then(([o, s]) => {
      if (cancelled) return
      setState({ overview: o.data ?? null, series: s.data ?? null, loading: false, key })
    })
    return () => {
      cancelled = true
    }
  }, [orgId, from, to])

  const loading = state.loading || state.key !== `${orgId}|${from}|${to}`
  const overview = state.overview
  const series = state.series

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />
        ))}
      </div>
    )
  }

  if (!overview) {
    return <div className="text-on-surface-variant">No data.</div>
  }

  const { totals, rates, bySource, topBroadcasts, topCampaigns } = overview
  const sourceData = [
    { label: 'Broadcasts', value: bySource.broadcast.sent },
    { label: 'Campaigns', value: bySource.campaign.sent },
    { label: 'Sequences', value: bySource.sequence.sent },
    { label: 'One-off', value: bySource.oneOff.sent },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Sent" value={totals.sent} />
        <Kpi label="Delivered" value={totals.delivered} sub={pct(rates.deliveryRate)} />
        <Kpi label="Opened" value={totals.opened} sub={pct(rates.openRate) + ' open rate'} />
        <Kpi label="Clicked" value={totals.clicked} sub={pct(rates.clickRate) + ' CTR'} />
        <Kpi label="Bounced" value={totals.bounced} sub={pct(rates.bounceRate)} tone="warn" />
        <Kpi label="Unsubscribed" value={totals.unsubscribed} sub={pct(rates.unsubRate)} tone="warn" />
        <Kpi label="Failed" value={totals.failed} tone="warn" />
        <Kpi label="CTR on opens" value={pct(rates.ctrOnOpens)} />
      </div>

      <Section title="Engagement over time">
        {series && series.series.length > 0 ? (
          <LineChart
            series={[
              { name: 'Sent', points: series.series.map((s) => ({ x: s.date, y: s.sent })) },
              { name: 'Opened', points: series.series.map((s) => ({ x: s.date, y: s.opened })) },
              { name: 'Clicked', points: series.series.map((s) => ({ x: s.date, y: s.clicked })) },
            ]}
          />
        ) : (
          <Empty>No emails sent in this window.</Empty>
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title="By source">
          <Donut data={sourceData.filter((d) => d.value > 0)} />
        </Section>
        <Section title="Top broadcasts">
          {topBroadcasts.length === 0 ? (
            <Empty>No broadcasts in range.</Empty>
          ) : (
            <BarChart data={topBroadcasts.map((b) => ({ label: b.name, value: b.sent }))} />
          )}
        </Section>
      </div>

      <Section title="Top campaigns">
        {topCampaigns.length === 0 ? (
          <Empty>No campaigns in range.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-on-surface-variant text-left">
              <tr>
                <th className="py-2">Name</th>
                <th className="py-2 text-right">Sent</th>
                <th className="py-2 text-right">Open rate</th>
                <th className="py-2 text-right">Click rate</th>
              </tr>
            </thead>
            <tbody>
              {topCampaigns.map((c) => (
                <tr key={c.id} className="border-t border-outline-variant">
                  <td className="py-2 text-on-surface">{c.name}</td>
                  <td className="py-2 text-right tabular-nums">{c.sent}</td>
                  <td className="py-2 text-right tabular-nums">{pct(c.openRate)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(c.clickRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

// ── Engagement tab ──────────────────────────────────────────────────────────

const ENGAGEMENT_STATUSES: ContactEngagement['status'][] = [
  'highly-engaged',
  'engaged',
  'cooling',
  'dormant',
  'unsubscribed',
  'bounced',
]

function EngagementTab({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState<ContactEngagement['status'] | 'all'>('all')
  const [state, setState] = useState<{ rows: ContactEngagement[]; loading: boolean; key: string }>(
    { rows: [], loading: true, key: '' },
  )

  useEffect(() => {
    const key = `${orgId}|${status}`
    const q = status === 'all' ? '' : `&status=${status}`
    let cancelled = false
    fetch(`/api/v1/email-analytics/contacts?orgId=${orgId}&limit=200${q}`)
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return
        setState({ rows: b.data ?? [], loading: false, key })
      })
    return () => {
      cancelled = true
    }
  }, [orgId, status])

  const loading = state.loading || state.key !== `${orgId}|${status}`
  const rows = state.rows

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatus('all')}
          className={`px-3 py-1 rounded-full text-xs ${
            status === 'all' ? 'bg-amber-500 text-black' : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          All
        </button>
        {ENGAGEMENT_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1 rounded-full text-xs ${
              status === s ? 'bg-amber-500 text-black' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-64 rounded-xl bg-surface-container animate-pulse" />
      ) : rows.length === 0 ? (
        <Empty>No contacts match this filter.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-on-surface-variant text-left">
            <tr>
              <th className="py-2">Contact</th>
              <th className="py-2 text-right">Score</th>
              <th className="py-2 text-right">Sent</th>
              <th className="py-2 text-right">Opened</th>
              <th className="py-2 text-right">Clicked</th>
              <th className="py-2">Status</th>
              <th className="py-2">Last engaged</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contactId} className="border-t border-outline-variant">
                <td className="py-2">
                  <div className="text-on-surface">{r.name || r.email}</div>
                  <div className="text-xs text-on-surface-variant">{r.email}</div>
                </td>
                <td className="py-2 text-right tabular-nums">{r.score}</td>
                <td className="py-2 text-right tabular-nums">{r.sent}</td>
                <td className="py-2 text-right tabular-nums">{r.opened}</td>
                <td className="py-2 text-right tabular-nums">{r.clicked}</td>
                <td className="py-2">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-surface-container text-on-surface-variant">
                    {r.status}
                  </span>
                </td>
                <td className="py-2 text-on-surface-variant text-xs">
                  {r.lastEngagedAt ? new Date(r.lastEngagedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Broadcasts tab ──────────────────────────────────────────────────────────

function BroadcastsTab({ orgId, from, to }: { orgId: string; from: string; to: string }) {
  const [state, setState] = useState<{ overview: OrgEmailOverview | null; loading: boolean; key: string }>(
    { overview: null, loading: true, key: '' },
  )

  useEffect(() => {
    const key = `${orgId}|${from}|${to}`
    const fromIso = new Date(from).toISOString()
    const toIso = new Date(`${to}T23:59:59.999Z`).toISOString()
    let cancelled = false
    fetch(`/api/v1/email-analytics/overview?orgId=${orgId}&from=${fromIso}&to=${toIso}`)
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return
        setState({ overview: b.data ?? null, loading: false, key })
      })
    return () => {
      cancelled = true
    }
  }, [orgId, from, to])

  const loading = state.loading || state.key !== `${orgId}|${from}|${to}`
  const overview = state.overview

  if (loading) return <div className="h-64 rounded-xl bg-surface-container animate-pulse" />
  if (!overview || overview.topBroadcasts.length === 0) {
    return <Empty>No broadcasts in this window.</Empty>
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-on-surface-variant text-left">
        <tr>
          <th className="py-2">Name</th>
          <th className="py-2 text-right">Sent</th>
          <th className="py-2 text-right">Opened</th>
          <th className="py-2 text-right">Clicked</th>
          <th className="py-2 text-right">Open rate</th>
          <th className="py-2 text-right">Click rate</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {overview.topBroadcasts.map((b) => (
          <tr key={b.id} className="border-t border-outline-variant">
            <td className="py-2 text-on-surface">{b.name}</td>
            <td className="py-2 text-right tabular-nums">{b.sent}</td>
            <td className="py-2 text-right tabular-nums">{b.opened}</td>
            <td className="py-2 text-right tabular-nums">{b.clicked}</td>
            <td className="py-2 text-right tabular-nums">{pct(b.openRate)}</td>
            <td className="py-2 text-right tabular-nums">{pct(b.clickRate)}</td>
            <td className="py-2 text-right">
              <Link
                href={`/admin/email-analytics/broadcasts/${b.id}`}
                className="text-amber-500 hover:underline text-xs"
              >
                Details →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Leaderboard tab ─────────────────────────────────────────────────────────

function LeaderboardTab({ from, to }: { from: string; to: string }) {
  const [state, setState] = useState<{ rows: OrgComparisonRow[]; loading: boolean; key: string }>(
    { rows: [], loading: true, key: '' },
  )

  useEffect(() => {
    const key = `${from}|${to}`
    const fromIso = new Date(from).toISOString()
    const toIso = new Date(`${to}T23:59:59.999Z`).toISOString()
    let cancelled = false
    fetch(`/api/v1/email-analytics/leaderboard?from=${fromIso}&to=${toIso}`)
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return
        setState({ rows: b.data ?? [], loading: false, key })
      })
    return () => {
      cancelled = true
    }
  }, [from, to])

  const loading = state.loading || state.key !== `${from}|${to}`
  const rows = state.rows

  if (loading) return <div className="h-64 rounded-xl bg-surface-container animate-pulse" />
  if (rows.length === 0) return <Empty>No org activity in this window.</Empty>

  return (
    <table className="w-full text-sm">
      <thead className="text-on-surface-variant text-left">
        <tr>
          <th className="py-2">Org</th>
          <th className="py-2 text-right">Sent</th>
          <th className="py-2 text-right">Open rate</th>
          <th className="py-2 text-right">Click rate</th>
          <th className="py-2 text-right">Bounce rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.orgId} className="border-t border-outline-variant">
            <td className="py-2 text-on-surface">{r.orgName}</td>
            <td className="py-2 text-right tabular-nums">{r.sent}</td>
            <td className="py-2 text-right tabular-nums">{pct(r.openRate)}</td>
            <td className="py-2 text-right tabular-nums">{pct(r.clickRate)}</td>
            <td className="py-2 text-right tabular-nums">{pct(r.bounceRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Atoms ───────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number | string
  sub?: string
  tone?: 'warn'
}) {
  return (
    <div className="rounded-xl bg-surface-container p-4">
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className={`text-2xl font-semibold ${tone === 'warn' ? 'text-red-400' : 'text-on-surface'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-on-surface-variant mt-1">{sub}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-on-surface-variant mb-2">{title}</h2>
      <div className="rounded-xl bg-surface-container p-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-on-surface-variant text-sm">{children}</div>
}
