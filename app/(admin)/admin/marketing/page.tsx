'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

interface EmailStats {
  funnel: {
    sent: number
    opened: number
    clicked: number
    failed: number
    openRate: number
    clickRate: number
  }
  sources: Array<{ source: string; count: number }>
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-on-surface-variant capitalize">{label}</span>
        <span className="text-on-surface font-medium">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-container overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function MarketingPage() {
  const [stats, setStats] = useState<EmailStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/dashboard/email-stats')
      .then((r) => r.json())
      .then((b) => { setStats(b.data); setLoading(false) })
  }, [])

  const maxFunnelValue = stats?.funnel.sent ?? 1

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Marketing</h1>
        <p className="text-sm text-on-surface-variant mt-1">Email performance and lead source analytics</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-4">Email Funnel</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-8 rounded-xl bg-surface-container animate-pulse" />)}
          </div>
        ) : stats ? (
          <div className="rounded-xl bg-surface-container p-6 space-y-5">
            <FunnelBar label="sent" value={stats.funnel.sent} max={maxFunnelValue} color="bg-blue-400" />
            <FunnelBar label="opened" value={stats.funnel.opened} max={maxFunnelValue} color="bg-green-400" />
            <FunnelBar label="clicked" value={stats.funnel.clicked} max={maxFunnelValue} color="bg-purple-400" />
            <FunnelBar label="failed" value={stats.funnel.failed} max={maxFunnelValue} color="bg-red-400" />
            <div className="pt-3 border-t border-outline-variant flex gap-6">
              <div>
                <p className="text-2xl font-bold text-on-surface">{stats.funnel.openRate}%</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Open rate</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-on-surface">{stats.funnel.clickRate}%</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Click rate</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-4">Lead Sources</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-surface-container animate-pulse" />)}
          </div>
        ) : stats && stats.sources.length === 0 ? (
          <p className="text-on-surface-variant text-sm text-center py-8">No contacts yet.</p>
        ) : stats ? (
          <div className="rounded-xl bg-surface-container overflow-hidden">
            {stats.sources.filter((s) => s.source !== 'unknown').map((s, i) => {
              const maxCount = stats.sources[0]?.count ?? 1
              const pct = (s.count / maxCount) * 100
              return (
                <div key={s.source} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-outline-variant' : ''}`}>
                  <span className="text-sm font-medium text-on-surface w-28 capitalize">{s.source}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm text-on-surface-variant w-8 text-right">{s.count}</span>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
