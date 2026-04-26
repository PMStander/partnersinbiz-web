'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Kpis {
  total_revenue: number
  mrr: number
  arr: number
  active_subs: number
  ad_revenue: number
  iap_revenue: number
  installs: number
  sessions: number
  outstanding: number
  invoiced_revenue_paid: number
  deltas: Record<string, number | null>
}

interface PortalProperty {
  id: string
  name: string
  type: string
}

interface PortalConnection {
  id: string
  provider: string
  propertyId: string
  status: string
}

interface PortalReport {
  id: string
  type: string
  period: { start: string; end: string }
  status: string
  publicToken: string | null
  kpis: { total_revenue: number; mrr: number }
  sentAt: { _seconds: number } | null
  createdAt: { _seconds: number } | null
}

interface DashboardData {
  kpis: Kpis
  period: { start: string; end: string }
  properties: PortalProperty[]
  connections: PortalConnection[]
  reports: PortalReport[]
}

const fmtZar = new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR', maximumFractionDigits: 0,
})
const fmtNum = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 })

function fmtPct(p: number | null) {
  if (p === null) return '—'
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(1)}%`
}
function deltaClass(p: number | null) {
  if (p === null) return 'text-[var(--color-on-surface-variant)]'
  if (p > 0) return 'text-emerald-300'
  if (p < 0) return 'text-rose-300'
  return 'text-[var(--color-on-surface-variant)]'
}

function Tile({ label, value, delta, hint }: { label: string; value: string; delta?: number | null; hint?: string }) {
  return (
    <div className="pib-card">
      <p className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-2">{label}</p>
      <p className="font-headline text-3xl font-bold tracking-tighter">{value}</p>
      {(delta !== undefined || hint) && (
        <p className="mt-2 text-xs">
          {delta !== undefined && (
            <span className={`font-mono ${deltaClass(delta ?? null)}`}>
              {fmtPct(delta ?? null)}
              <span className="text-[var(--color-on-surface-variant)]"> vs prior</span>
            </span>
          )}
          {hint && <span className="text-[var(--color-on-surface-variant)] ml-2">{hint}</span>}
        </p>
      )}
    </div>
  )
}

export default function PortalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/portal/dashboard')
      .then((r) => r.json())
      .then((b) => { setData(b); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const noData = !loading && (!data || (data?.connections?.length ?? 0) === 0)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Dashboard</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">
          {data?.period ? `Month-to-date (${data.period.start} → ${data.period.end})` : 'Performance overview.'}
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="pib-skeleton h-28" />
          ))}
        </div>
      )}

      {noData && (
        <div className="pib-card p-8 text-center">
          <p className="font-headline text-xl mb-2">No data yet.</p>
          <p className="text-sm text-[var(--color-on-surface-variant)] max-w-md mx-auto">
            Once your team connects integrations (RevenueCat, AdSense, AdMob, App Store Connect, Play Console, Google Ads, GA4), KPIs will appear here within 24 hours.
          </p>
          <Link href="/portal/properties" className="inline-block mt-6 text-xs uppercase tracking-widest font-label text-[var(--color-accent-v2)] hover:underline">
            Manage properties →
          </Link>
        </div>
      )}

      {!loading && data && data.connections.length > 0 && (
        <>
          {/* Headline KPIs */}
          <section>
            <h2 className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-3">Headline metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Total revenue" value={fmtZar.format(data.kpis.total_revenue)} delta={data.kpis.deltas.total_revenue} />
              <Tile label="MRR" value={fmtZar.format(data.kpis.mrr)} delta={data.kpis.deltas.mrr} />
              <Tile label="Active subs" value={fmtNum.format(data.kpis.active_subs)} delta={data.kpis.deltas.active_subs} />
              <Tile label="Sessions" value={fmtNum.format(data.kpis.sessions)} delta={data.kpis.deltas.sessions} />
              <Tile label="Ad revenue" value={fmtZar.format(data.kpis.ad_revenue)} delta={data.kpis.deltas.ad_revenue} />
              <Tile label="IAP revenue" value={fmtZar.format(data.kpis.iap_revenue)} delta={data.kpis.deltas.iap_revenue} />
              <Tile label="Installs" value={fmtNum.format(data.kpis.installs)} delta={data.kpis.deltas.installs} />
              <Tile label="Outstanding" value={fmtZar.format(data.kpis.outstanding)} hint="invoiced, unpaid" />
            </div>
          </section>

          {/* Latest report */}
          {data.reports.length > 0 && (
            <section>
              <h2 className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-3">Latest report</h2>
              <div className="pib-card flex items-center justify-between gap-4">
                <div>
                  <p className="font-headline text-lg">{data.reports[0].period.start} → {data.reports[0].period.end}</p>
                  <p className="text-xs text-[var(--color-on-surface-variant)] uppercase tracking-widest font-label mt-1">{data.reports[0].type} · {data.reports[0].status}</p>
                </div>
                <div className="flex items-center gap-2">
                  {data.reports[0].publicToken && (
                    <Link
                      href={`/reports/${data.reports[0].publicToken}`}
                      target="_blank"
                      className="px-3 py-1.5 text-xs rounded-full bg-[var(--color-accent-v2)] text-[var(--color-bg)] font-medium uppercase tracking-widest font-label"
                    >
                      Open
                    </Link>
                  )}
                  <Link href="/portal/reports" className="px-3 py-1.5 text-xs rounded-full border border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] uppercase tracking-widest font-label">
                    All
                  </Link>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
