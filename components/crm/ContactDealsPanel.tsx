'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Deal, DealStage } from '@/lib/crm/types'
import { STAGE_LABELS } from '@/components/crm/DealKanban'

// Stage order for sorting (lower index = earlier in funnel)
const STAGE_ORDER: Record<DealStage, number> = {
  discovery:   0,
  proposal:    1,
  negotiation: 2,
  won:         3,
  lost:        4,
}

// Colour per stage — matches the stageColorHex used on the deals list page
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

function fmtCloseDate(ts: unknown): string {
  if (!ts || typeof ts !== 'object') return ''
  const s = (ts as Record<string, unknown>)._seconds
  if (typeof s !== 'number') return ''
  return new Date(s * 1000).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtValue(deal: Deal): string {
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: deal.currency ?? 'ZAR',
      maximumFractionDigits: 2,
    }).format(deal.value ?? 0)
  } catch {
    return `${deal.currency ?? ''} ${(deal.value ?? 0).toFixed(2)}`
  }
}

interface Props {
  contactId: string
}

export function ContactDealsPanel({ contactId }: Props) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!contactId) return
    let cancelled = false
    fetch(`/api/v1/crm/deals?contactId=${encodeURIComponent(contactId)}&limit=100`)
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return
        const raw: Deal[] = b.data ?? []
        // Sort by stage order, then by updatedAt DESC within each stage
        const sorted = [...raw].sort((a, b) => {
          const stageDiff = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]
          if (stageDiff !== 0) return stageDiff
          const aTs = (a.updatedAt as Record<string, number> | null)?._seconds ?? 0
          const bTs = (b.updatedAt as Record<string, number> | null)?._seconds ?? 0
          return bTs - aTs
        })
        setDeals(sorted)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [contactId])

  return (
    <div className="pib-card-section">
      <div className="px-5 py-3.5 border-b border-[var(--color-pib-line)] bg-white/[0.02] flex items-center justify-between">
        <p className="eyebrow !text-[10px]">Deals</p>
        <span className="text-[11px] text-[var(--color-pib-text-muted)] font-mono">
          {loading ? '…' : `${deals.length} record${deals.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {loading ? (
        <div className="p-5 space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="pib-skeleton h-12" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="p-10 text-center">
          <span className="material-symbols-outlined text-3xl text-[var(--color-pib-text-muted)]">
            monetization_on
          </span>
          <p className="text-sm text-[var(--color-pib-text-muted)] mt-2">
            No deals linked to this contact yet.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-pib-line)]">
          {deals.map((deal) => {
            const hex = stageColorHex(deal.stage)
            const closeDate = fmtCloseDate(deal.expectedCloseDate)
            return (
              <div key={deal.id} className="px-5 py-3 flex items-center gap-4">
                <span
                  className="material-symbols-outlined text-[18px] shrink-0"
                  style={{ color: hex }}
                >
                  monetization_on
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/portal/deals?focus=${deal.id}`}
                    className="text-sm font-medium text-[var(--color-pib-text)] hover:underline truncate block"
                  >
                    {deal.title}
                  </Link>
                  <p className="text-[11px] text-[var(--color-pib-text-muted)] font-mono mt-0.5">
                    {fmtValue(deal)}
                    {closeDate ? ` · Close ${closeDate}` : ''}
                  </p>
                </div>
                <span
                  className="text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: `${hex}20`, color: hex }}
                >
                  {STAGE_LABELS[deal.stage]}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
