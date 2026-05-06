'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Campaign, CampaignStatus } from '@/lib/campaigns/types'
import { fmtTimestamp } from '@/components/admin/email/fmtTimestamp'

interface OrganizationSummary {
  id: string
  slug: string
  name: string
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: 'bg-surface-container text-on-surface-variant',
  scheduled: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-gray-200 text-gray-700',
}

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
}

export default function CampaignsPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgLookupDone, setOrgLookupDone] = useState(false)

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Resolve slug → orgId
  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/organizations')
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return
        const list = (body.data ?? []) as OrganizationSummary[]
        const match = list.find((o) => o.slug === slug)
        setOrgId(match?.id ?? null)
        setOrgName(match?.name ?? '')
        setOrgLookupDone(true)
      })
      .catch(() => {
        if (!cancelled) setOrgLookupDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const loadCampaigns = useCallback((id: string) => {
    setLoading(true)
    fetch(`/api/v1/campaigns?orgId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((body) => setCampaigns((body.data ?? []) as Campaign[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!orgId) return
    loadCampaigns(orgId)
  }, [orgId, loadCampaigns])

  async function createCampaign() {
    if (!orgId) return
    const name = newName.trim()
    if (!name) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/v1/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, name }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error ?? 'Failed to create campaign')
        return
      }
      const newId = body.data?.id
      if (newId) {
        router.push(`/admin/org/${slug}/campaigns/${newId}`)
      }
    } catch {
      setFormError('Failed to create campaign')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
            {orgName || 'Workspace'}
          </p>
          <h1 className="text-2xl font-semibold text-on-surface">Campaigns</h1>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
            Audience-targeted email programs powered by your sequences.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          disabled={!orgId}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
        >
          New campaign
        </button>
      </div>

      {creating && (
        <div className="rounded-xl bg-surface-container border border-outline-variant p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Campaign name"
              className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
              onKeyDown={(e) => e.key === 'Enter' && createCampaign()}
              autoFocus
            />
            <button
              onClick={createCampaign}
              disabled={submitting || !newName.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewName('')
                setFormError(null)
              }}
              className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm"
            >
              Cancel
            </button>
          </div>
          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
        </div>
      )}

      {orgLookupDone && !orgId && (
        <p className="text-sm text-red-600">
          Could not find an organisation for slug &quot;{slug}&quot;.
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant rounded-xl">
          No campaigns yet. Create one to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant">
          <table className="w-full text-sm">
            <thead className="bg-surface-container">
              <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Audience</th>
                <th className="px-4 py-2 font-medium text-right">Open</th>
                <th className="px-4 py-2 font-medium text-right">Click</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
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
                  <tr
                    key={c.id}
                    className="border-t border-outline-variant hover:bg-surface-container transition-colors cursor-pointer"
                    onClick={() => router.push(`/admin/org/${slug}/campaigns/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/org/${slug}/campaigns/${c.id}`}
                        className="font-medium text-on-surface hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                      {c.description && (
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate max-w-md">
                          {c.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status] ?? ''}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface tabular-nums">
                      {stats.enrolled}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant tabular-nums">
                      {pct(stats.opened, stats.sent)}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface-variant tabular-nums">
                      {pct(stats.clicked, stats.sent)}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs whitespace-nowrap">
                      {fmtTimestamp(c.createdAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
