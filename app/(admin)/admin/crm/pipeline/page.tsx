// app/(admin)/admin/crm/pipeline/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

const STAGES = ['discovery', 'proposal', 'negotiation', 'won', 'lost'] as const
type Stage = typeof STAGES[number]

interface Deal {
  id: string
  title: string
  contactId: string
  value: number
  currency: string
  stage: Stage
  expectedCloseDate: { seconds: number } | null
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const dragging = useRef<string | null>(null)

  useEffect(() => {
    fetch('/api/v1/crm/deals')
      .then((r) => r.json())
      .then((b) => { setDeals(b.data ?? []); setLoading(false) })
  }, [])

  async function moveDeal(id: string, newStage: Stage) {
    setDeals((prev) => prev.map((d) => d.id === id ? { ...d, stage: newStage } : d))
    await fetch(`/api/v1/crm/deals/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
  }

  function stageDeals(stage: Stage) {
    return deals.filter((d) => d.stage === stage)
  }

  function stageValue(stage: Stage) {
    return stageDeals(stage).reduce((sum, d) => sum + (d.value ?? 0), 0)
  }

  function fmt(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold tracking-tighter">Pipeline</h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Total open: {fmt(deals.filter((d) => d.stage !== 'lost').reduce((s, d) => s + d.value, 0), 'USD')}
          </p>
        </div>
        <Link
          href="/admin/crm/contacts"
          className="text-sm font-label text-on-surface-variant border border-outline-variant px-3 py-1.5 hover:text-on-surface transition-colors"
        >
          + New Deal via Contact
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-4">
          {STAGES.map((s) => (
            <div key={s} className="flex-1 h-64 bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="flex-1 min-w-[200px] flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging.current) moveDeal(dragging.current, stage)
                dragging.current = null
              }}
            >
              {/* Column header */}
              <div className="border border-outline-variant px-3 py-2 mb-2 flex justify-between items-center">
                <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
                  {stage}
                </span>
                <span className="text-[10px] font-label text-on-surface-variant">
                  {stageValue(stage) > 0 ? fmt(stageValue(stage), 'USD') : stageDeals(stage).length}
                </span>
              </div>

              {/* Deal cards */}
              <div className="flex flex-col gap-2 flex-1 min-h-[120px]">
                {stageDeals(stage).length === 0 ? (
                  <div className="border border-dashed border-outline-variant/40 p-4 text-center">
                    <p className="text-[11px] text-on-surface-variant/50">Drop here</p>
                  </div>
                ) : (
                  stageDeals(stage).map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => { dragging.current = deal.id }}
                      className="border border-outline-variant p-3 cursor-grab active:cursor-grabbing hover:bg-surface-container transition-colors"
                    >
                      <p className="text-sm font-medium text-on-surface mb-1 truncate">{deal.title}</p>
                      {deal.value > 0 && (
                        <p className="text-[11px] text-on-surface-variant">
                          {fmt(deal.value, deal.currency || 'USD')}
                        </p>
                      )}
                      {deal.expectedCloseDate && (
                        <p className="text-[10px] text-on-surface-variant/60 mt-1">
                          Close {new Date(deal.expectedCloseDate.seconds * 1000).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
