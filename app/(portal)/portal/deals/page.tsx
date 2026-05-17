'use client'

import { useEffect, useState, useCallback } from 'react'
import { DealKanban, DEAL_STAGES, STAGE_LABELS } from '@/components/crm/DealKanban'
import type { Deal, DealStage } from '@/lib/crm/types'

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

// ── Pipeline value summary strip ───────────────────────────────────────────────

function PipelineSummary({ deals }: { deals: Deal[] }) {
  const total = deals.filter(d => d.stage !== 'lost').reduce((sum, d) => sum + (d.value ?? 0), 0)
  const won = deals.filter(d => d.stage === 'won').reduce((sum, d) => sum + (d.value ?? 0), 0)
  const open = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length

  function fmt(v: number) {
    try {
      const primary = deals.find(d => d.currency)?.currency ?? 'ZAR'
      return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: primary, maximumFractionDigits: 0 }).format(v)
    } catch {
      return v.toFixed(0)
    }
  }

  return (
    <div className="flex gap-4 flex-wrap">
      {[
        { label: 'Pipeline value', value: fmt(total), sub: 'excl. lost' },
        { label: 'Won',            value: fmt(won),   sub: 'all time' },
        { label: 'Open deals',     value: String(open), sub: 'active' },
        { label: 'Total deals',    value: String(deals.length), sub: 'all stages' },
      ].map(stat => (
        <div
          key={stat.label}
          className="pib-card px-4 py-3 min-w-[130px]"
        >
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-0.5">{stat.label}</p>
          <p className="text-xl font-headline font-bold text-on-surface leading-none">{stat.value}</p>
          <p className="text-[10px] text-on-surface-variant mt-0.5">{stat.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<DealStage | 'all'>('all')
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/v1/crm/deals?limit=200')
      .then(r => r.json())
      .then(body => {
        if (cancelled) return
        if (!body.success) throw new Error(body.error ?? 'Failed to load deals')
        setDeals(body.data ?? [])
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message ?? 'Failed to load deals')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleStageChange = useCallback(async (dealId: string, newStage: DealStage) => {
    // Optimistic update happens inside DealKanban; we just fire the PATCH
    const res = await fetch(`/api/v1/crm/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Failed to update deal stage')
    }
    // Sync local list so list-view stays consistent
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d))
  }, [])

  const filteredDeals = stageFilter === 'all' ? deals : deals.filter(d => d.stage === stageFilter)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">CRM / Deals</p>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Pipeline</h1>
        </div>

        {/* View toggle */}
        <div
          className="flex rounded-[var(--radius-btn)] overflow-hidden border"
          style={{ borderColor: 'var(--color-outline)' }}
        >
          {(['board', 'list'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label capitalize transition-colors"
              style={
                viewMode === mode
                  ? { background: 'var(--color-accent-v2)', color: '#000' }
                  : { background: 'transparent', color: 'var(--color-on-surface-variant)' }
              }
            >
              <span className="material-symbols-outlined text-[14px]">
                {mode === 'board' ? 'view_kanban' : 'list'}
              </span>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      {!loading && !error && <PipelineSummary deals={deals} />}

      {/* Stage filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(['all', ...DEAL_STAGES] as const).map(s => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={[
              'text-xs font-label px-3 py-1.5 rounded-[var(--radius-btn)] transition-colors capitalize',
              stageFilter === s
                ? 'text-black font-medium'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
            ].join(' ')}
            style={stageFilter === s ? { background: 'var(--color-accent-v2)' } : {}}
          >
            {s === 'all' ? 'All stages' : STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div
          className="rounded-[var(--radius-card)] px-4 py-3 text-sm"
          style={{ background: '#ef444420', color: '#f87171', border: '1px solid #ef444430' }}
        >
          {error}
        </div>
      )}

      {/* Board view */}
      {!error && viewMode === 'board' && (
        loading ? (
          <DealKanban deals={[]} loading onStageChange={handleStageChange} />
        ) : filteredDeals.length === 0 && stageFilter === 'all' ? (
          <div className="pib-card py-16 text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant block mb-3">
              monetization_on
            </span>
            <p className="text-on-surface-variant text-sm">No deals yet.</p>
            <p className="text-on-surface-variant text-xs mt-1">Deals you create will appear here as a kanban pipeline.</p>
          </div>
        ) : (
          <DealKanban deals={filteredDeals} onStageChange={handleStageChange} />
        )
      )}

      {/* List view */}
      {!error && viewMode === 'list' && (
        loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="pib-card py-12 text-center">
            <p className="text-on-surface-variant text-sm">No deals found.</p>
          </div>
        ) : (
          <div className="pib-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-card-border)' }}>
                  {['Deal', 'Stage', 'Value', 'Contact'].map(h => (
                    <th
                      key={h}
                      className="text-left text-[10px] font-label uppercase tracking-widest text-on-surface-variant px-4 py-2.5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map(deal => (
                  <tr
                    key={deal.id}
                    className="border-b transition-colors hover:bg-[var(--color-surface-container)]"
                    style={{ borderColor: 'var(--color-card-border)' }}
                  >
                    <td className="px-4 py-3 font-medium text-on-surface">{deal.title}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{
                          background: `${stageColorHex(deal.stage)}20`,
                          color: stageColorHex(deal.stage),
                        }}
                      >
                        {STAGE_LABELS[deal.stage]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-on-surface-variant text-xs">
                      {deal.currency} {deal.value?.toFixed(0)}
                    </td>
                    <td className="px-4 py-3">
                      {deal.contactId ? (
                        <a
                          href={`/portal/crm/contacts/${deal.contactId}`}
                          className="text-xs text-[var(--color-accent-v2)] hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// Helper used in list view only (avoids import of internal DealKanban constant)
function stageColorHex(stage: DealStage): string {
  const map: Record<DealStage, string> = {
    discovery:   '#60a5fa',
    proposal:    '#a78bfa',
    negotiation: '#c084fc',
    won:         '#4ade80',
    lost:        '#ef4444',
  }
  return map[stage] ?? '#6b7280'
}
