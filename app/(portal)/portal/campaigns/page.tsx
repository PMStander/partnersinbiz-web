'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Campaign, CampaignStatus } from '@/lib/campaigns/types'
import { fmtTimestamp } from '@/components/admin/email/fmtTimestamp'

const STATUS_PILL: Record<CampaignStatus, string> = {
  draft:     'pib-pill',
  scheduled: 'pib-pill pib-pill-info',
  active:    'pib-pill pib-pill-success',
  paused:    'pib-pill pib-pill-warn',
  completed: 'pib-pill',
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
}

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
}

export default function PortalCampaignsPage() {
  const router = useRouter()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadCampaigns = useCallback(() => {
    setLoading(true)
    fetch('/api/v1/campaigns')
      .then((r) => r.json())
      .then((body) => setCampaigns((body.data ?? []) as Campaign[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  async function createCampaign() {
    const name = newName.trim()
    if (!name) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/v1/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error ?? 'Failed to create campaign')
        return
      }
      const newId = body.data?.id
      if (newId) {
        router.push(`/portal/campaigns/${newId}`)
      }
    } catch {
      setFormError('Failed to create campaign')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-10">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">Email programs</p>
          <h1 className="pib-page-title mt-2">Campaigns</h1>
          <p className="pib-page-sub max-w-2xl">
            Audience-targeted email programs powered by your sequences.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn-pib-accent"
        >
          New campaign
          <span className="material-symbols-outlined text-base">add</span>
        </button>
      </header>

      {creating && (
        <div className="bento-card !p-5">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Campaign name"
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)] text-[var(--color-pib-text)] text-sm placeholder:text-[var(--color-pib-text-muted)] focus:outline-none focus:border-[var(--color-pib-accent)]"
              onKeyDown={(e) => e.key === 'Enter' && createCampaign()}
              autoFocus
            />
            <button
              onClick={createCampaign}
              disabled={submitting || !newName.trim()}
              className="btn-pib-accent disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewName('')
                setFormError(null)
              }}
              className="btn-pib-secondary"
            >
              Cancel
            </button>
          </div>
          {formError && <p className="mt-2 text-sm text-[#FCA5A5]">{formError}</p>}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="pib-skeleton h-16" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">campaign</span>
          <h2 className="font-display text-2xl mt-4">No campaigns yet.</h2>
          <p className="text-sm text-[var(--color-pib-text-muted)] max-w-md mx-auto mt-2 text-pretty">
            Create your first campaign to send a sequence to a segment of your contacts.
          </p>
          <button onClick={() => setCreating(true)} className="btn-pib-secondary mt-6">
            New campaign
            <span className="material-symbols-outlined text-base">add</span>
          </button>
        </div>
      ) : (
        <div className="pib-card-section">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-[var(--color-pib-line)] bg-white/[0.02]">
            <p className="col-span-4 eyebrow !text-[10px]">Name</p>
            <p className="col-span-2 eyebrow !text-[10px]">Status</p>
            <p className="col-span-1 eyebrow !text-[10px] text-right">Audience</p>
            <p className="col-span-1 eyebrow !text-[10px] text-right">Open</p>
            <p className="col-span-1 eyebrow !text-[10px] text-right">Click</p>
            <p className="col-span-3 eyebrow !text-[10px]">Created</p>
          </div>

          <div className="divide-y divide-[var(--color-pib-line)]">
            {campaigns.map((c) => {
              const stats = c.stats ?? {
                enrolled: 0,
                sent: 0,
                delivered: 0,
                opened: 0,
                clicked: 0,
                bounced: 0,
                unsubscribed: 0,
              }
              return (
                <Link
                  key={c.id}
                  href={`/portal/campaigns/${c.id}`}
                  className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-4 items-center px-5 py-4 hover:bg-[var(--color-pib-surface-2)] transition-colors"
                >
                  <div className="col-span-2 md:col-span-4 min-w-0">
                    <p className="font-medium text-[var(--color-pib-text)] truncate">{c.name}</p>
                    {c.description && (
                      <p className="text-xs text-[var(--color-pib-text-muted)] mt-0.5 truncate">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <span className={STATUS_PILL[c.status] ?? 'pib-pill'}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="md:col-span-1 text-right">
                    <p className="text-sm tabular-nums">
                      <span className="md:hidden eyebrow !text-[10px] mr-2">Audience</span>
                      {stats.enrolled}
                    </p>
                  </div>
                  <div className="md:col-span-1 text-right">
                    <p className="text-sm tabular-nums text-[var(--color-pib-text-muted)]">
                      <span className="md:hidden eyebrow !text-[10px] mr-2">Open</span>
                      {pct(stats.opened, stats.sent)}
                    </p>
                  </div>
                  <div className="md:col-span-1 text-right">
                    <p className="text-sm tabular-nums text-[var(--color-pib-text-muted)]">
                      <span className="md:hidden eyebrow !text-[10px] mr-2">Click</span>
                      {pct(stats.clicked, stats.sent)}
                    </p>
                  </div>
                  <div className="md:col-span-3">
                    <p className="text-xs text-[var(--color-pib-text-muted)] whitespace-nowrap">
                      {fmtTimestamp(c.createdAt)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
