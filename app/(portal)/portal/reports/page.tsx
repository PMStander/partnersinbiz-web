'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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

const fmtZar = new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR', maximumFractionDigits: 0,
})

function fmtTs(ts: { _seconds: number } | null) {
  if (!ts) return '—'
  return new Date(ts._seconds * 1000).toLocaleDateString('en-ZA', { dateStyle: 'medium' })
}

export default function PortalReports() {
  const [reports, setReports] = useState<PortalReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/portal/dashboard')
      .then((r) => r.json())
      .then((b) => { setReports(b.reports ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Reports</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">
          Branded monthly performance reports — generated on the 1st of each month.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="pib-skeleton h-20" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="pib-card p-8 text-center">
          <p className="font-headline text-xl mb-2">No reports yet.</p>
          <p className="text-sm text-[var(--color-on-surface-variant)] max-w-md mx-auto">
            The first monthly report will appear after the first full month of connected data.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="pib-card flex items-center justify-between gap-4">
              <div>
                <p className="font-headline text-lg">{r.period.start} → {r.period.end}</p>
                <p className="text-xs text-[var(--color-on-surface-variant)] uppercase tracking-widest font-label mt-1">
                  {r.type} · {r.status} · sent {fmtTs(r.sentAt)}
                </p>
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-2 font-mono">
                  Total revenue {fmtZar.format(r.kpis.total_revenue)} · MRR {fmtZar.format(r.kpis.mrr)}
                </p>
              </div>
              {r.publicToken ? (
                <Link
                  href={`/reports/${r.publicToken}`}
                  target="_blank"
                  className="px-3 py-1.5 text-xs rounded-full bg-[var(--color-accent-v2)] text-[var(--color-bg)] font-medium uppercase tracking-widest font-label"
                >
                  Open
                </Link>
              ) : (
                <span className="text-xs text-[var(--color-on-surface-variant)] font-label uppercase tracking-widest">draft</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
