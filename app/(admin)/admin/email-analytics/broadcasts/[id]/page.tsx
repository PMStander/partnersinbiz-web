'use client'

// app/(admin)/admin/email-analytics/broadcasts/[id]/page.tsx
//
// Per-broadcast analytics detail page.

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LineChart, BarChart, CountBar } from '@/components/admin/email-analytics/charts'
import type {
  BroadcastDetailedStats,
  BroadcastHeatmap,
} from '@/lib/email-analytics/aggregate'

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export default function BroadcastAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [id, setId] = useState<string | null>(null)
  const [data, setData] = useState<BroadcastDetailedStats | null>(null)
  const [heatmap, setHeatmap] = useState<BroadcastHeatmap | null>(null)
  const [heatmapLoading, setHeatmapLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => {
      setId(p.id)
      fetch(`/api/v1/email-analytics/broadcasts/${p.id}`)
        .then((r) => r.json())
        .then((b) => {
          if (b.success) setData(b.data)
          else setError(b.error ?? 'Failed to load')
        })
        .finally(() => setLoading(false))

      fetch(`/api/v1/email-analytics/broadcasts/${p.id}/heatmap`)
        .then((r) => r.json())
        .then((b) => {
          if (b.success) setHeatmap(b.data)
        })
        .finally(() => setHeatmapLoading(false))
    })
  }, [params])

  if (loading) return <div className="p-6 h-40 rounded-xl bg-surface-container animate-pulse" />
  if (error || !data) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/admin/email-analytics" className="text-amber-500 text-sm hover:underline">
          ← Back to email analytics
        </Link>
        <p className="mt-4 text-on-surface-variant">{error ?? 'Broadcast not found.'}</p>
      </div>
    )
  }

  const { stats, rates, timeline, topClicks, topDomains } = data
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Link href="/admin/email-analytics" className="text-amber-500 text-sm hover:underline">
        ← Back to email analytics
      </Link>
      <h1 className="text-2xl font-semibold text-on-surface">Broadcast detail</h1>
      <p className="text-xs text-on-surface-variant">ID: {id}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Audience" value={stats.audienceSize} />
        <Kpi label="Sent" value={stats.sent} />
        <Kpi label="Delivered" value={stats.delivered} sub={pct(rates.deliveryRate)} />
        <Kpi label="Opened" value={stats.opened} sub={pct(rates.openRate)} />
        <Kpi label="Clicked" value={stats.clicked} sub={pct(rates.clickRate)} />
        <Kpi label="Bounced" value={stats.bounced} sub={pct(rates.bounceRate)} tone="warn" />
        <Kpi label="Unsubscribed" value={stats.unsubscribed} sub={pct(rates.unsubRate)} tone="warn" />
        <Kpi label="Failed" value={stats.failed} tone="warn" />
      </div>

      <Section title="Timeline">
        {timeline.length === 0 ? (
          <Empty>No send activity recorded.</Empty>
        ) : (
          <LineChart
            series={[
              { name: 'Sent', points: timeline.map((s) => ({ x: s.date, y: s.sent })) },
              { name: 'Opened', points: timeline.map((s) => ({ x: s.date, y: s.opened })) },
              { name: 'Clicked', points: timeline.map((s) => ({ x: s.date, y: s.clicked })) },
            ]}
          />
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title="Top links clicked">
          {topClicks.length === 0 ? (
            <Empty>No tracked click data.</Empty>
          ) : (
            <BarChart data={topClicks.map((c) => ({ label: c.url, value: c.clicks }))} />
          )}
        </Section>

        <Section title="Top domains">
          {topDomains.length === 0 ? (
            <Empty>No recipient domains recorded.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-on-surface-variant text-left">
                <tr>
                  <th className="py-2">Domain</th>
                  <th className="py-2 text-right">Sent</th>
                  <th className="py-2 text-right">Open rate</th>
                </tr>
              </thead>
              <tbody>
                {topDomains.map((d) => (
                  <tr key={d.domain} className="border-t border-outline-variant">
                    <td className="py-2 text-on-surface">{d.domain}</td>
                    <td className="py-2 text-right tabular-nums">{d.sent}</td>
                    <td className="py-2 text-right tabular-nums">{pct(d.openRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Link heatmap">
        {heatmapLoading ? (
          <div className="h-32 rounded-lg bg-surface-container-high animate-pulse" />
        ) : !heatmap || heatmap.linkStats.length === 0 ? (
          <Empty>No tracked link clicks for this broadcast yet.</Empty>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-on-surface-variant mb-2">
              {heatmap.totalClicks.toLocaleString()} clicks across {heatmap.linkStats.length} link
              {heatmap.linkStats.length === 1 ? '' : 's'}.
            </div>
            {heatmap.linkStats.slice(0, 20).map((link, i) => {
              const max = heatmap.linkStats[0]?.clicks ?? 1
              const label = link.url
              const right = `${link.clicks.toLocaleString()} · ${(link.percentOfTotalClicks * 100).toFixed(1)}%`
              return (
                <CountBar
                  key={`${link.url}|${i}`}
                  label={
                    link.positionInEmail
                      ? `#${link.positionInEmail} · ${label}`
                      : label
                  }
                  value={link.clicks}
                  max={max}
                  rightLabel={right}
                />
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number
  sub?: string
  tone?: 'warn'
}) {
  return (
    <div className="rounded-xl bg-surface-container p-4">
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className={`text-2xl font-semibold ${tone === 'warn' ? 'text-red-400' : 'text-on-surface'}`}>
        {value.toLocaleString()}
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
