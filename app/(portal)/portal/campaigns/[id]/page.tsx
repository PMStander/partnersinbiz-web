'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Campaign, CampaignStats, CampaignStatus } from '@/lib/campaigns/types'
import type { Sequence } from '@/lib/sequences/types'
import type { EmailDomain } from '@/lib/email/domains'
import type { Segment } from '@/lib/crm/segments'

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

const SHARED_DOMAIN_LABEL = 'Shared (partnersinbiz.online)'

const EMPTY_STATS_LOCAL: CampaignStats = {
  enrolled: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
}

type AudienceMode = 'segment' | 'manual'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)] text-[var(--color-pib-text)] text-sm placeholder:text-[var(--color-pib-text-muted)] focus:outline-none focus:border-[var(--color-pib-accent)] disabled:opacity-60'

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
}

function parseIdList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function PortalCampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Editable form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fromDomainId, setFromDomainId] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromLocal, setFromLocal] = useState('campaigns')
  const [replyTo, setReplyTo] = useState('')

  const [audienceMode, setAudienceMode] = useState<AudienceMode>('segment')
  const [segmentId, setSegmentId] = useState('')
  const [contactIdsRaw, setContactIdsRaw] = useState('')

  const [sequenceId, setSequenceId] = useState('')

  const [captureSourceIdsRaw, setCaptureSourceIdsRaw] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')
  const [triggersOpen, setTriggersOpen] = useState(false)

  // Lookups
  const [domains, setDomains] = useState<EmailDomain[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [sequences, setSequences] = useState<Sequence[]>([])

  const [segmentCount, setSegmentCount] = useState<number | null>(null)
  const [segmentCountLoading, setSegmentCountLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const loadCampaign = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/campaigns/${id}`)
      if (!res.ok) {
        setNotFound(true)
        return
      }
      const body = await res.json()
      const c = body.data as Campaign
      setCampaign(c)
      setOrgId(c.orgId)
      setName(c.name ?? '')
      setDescription(c.description ?? '')
      setFromDomainId(c.fromDomainId ?? '')
      setFromName(c.fromName ?? '')
      setFromLocal(c.fromLocal ?? 'campaigns')
      setReplyTo(c.replyTo ?? '')
      setSegmentId(c.segmentId ?? '')
      setContactIdsRaw((c.contactIds ?? []).join('\n'))
      setAudienceMode(
        c.segmentId
          ? 'segment'
          : c.contactIds && c.contactIds.length > 0
            ? 'manual'
            : 'segment',
      )
      setSequenceId(c.sequenceId ?? '')
      setCaptureSourceIdsRaw((c.triggers?.captureSourceIds ?? []).join(', '))
      setTagsRaw((c.triggers?.tags ?? []).join(', '))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadCampaign()
  }, [loadCampaign])

  // Load lookups once we have the campaign — clients don't pass orgId, server scopes it
  useEffect(() => {
    if (!orgId) return
    fetch('/api/v1/email/domains')
      .then((r) => r.json())
      .then((b) => setDomains((b.data ?? []) as EmailDomain[]))
      .catch(() => {})
    fetch('/api/v1/crm/segments')
      .then((r) => r.json())
      .then((b) => setSegments((b.data ?? []) as Segment[]))
      .catch(() => {})
    fetch('/api/v1/sequences')
      .then((r) => r.json())
      .then((b) => setSequences((b.data ?? []) as Sequence[]))
      .catch(() => {})
  }, [orgId])

  // Resolve segment count when segment changes
  useEffect(() => {
    if (audienceMode !== 'segment' || !segmentId) {
      setSegmentCount(null)
      return
    }
    let cancelled = false
    setSegmentCountLoading(true)
    fetch(`/api/v1/crm/segments/${segmentId}/resolve`, { method: 'POST' })
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return
        const c = typeof b?.data?.count === 'number' ? b.data.count : null
        setSegmentCount(c)
      })
      .catch(() => {
        if (!cancelled) setSegmentCount(null)
      })
      .finally(() => {
        if (!cancelled) setSegmentCountLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [audienceMode, segmentId])

  const selectedSequence = useMemo(
    () => sequences.find((s) => s.id === sequenceId) ?? null,
    [sequences, sequenceId],
  )

  const selectedDomain = useMemo(
    () => domains.find((d) => d.id === fromDomainId) ?? null,
    [domains, fromDomainId],
  )

  const fromPreview = useMemo(() => {
    const dn = selectedDomain?.name || 'partnersinbiz.online'
    const local = (fromLocal || 'campaigns').trim()
    const display = (fromName || '').trim()
    const addr = `${local}@${dn}`
    return display ? `${display} <${addr}>` : addr
  }, [selectedDomain, fromLocal, fromName])

  const status: CampaignStatus = campaign?.status ?? 'draft'
  const editable = status === 'draft' || status === 'paused'
  const stats = campaign?.stats ?? EMPTY_STATS_LOCAL

  async function handleSave() {
    if (!campaign) return
    setError(null)
    setInfo(null)
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description,
        fromDomainId,
        fromName,
        fromLocal,
        replyTo,
        sequenceId,
        triggers: {
          captureSourceIds: parseIdList(captureSourceIdsRaw),
          tags: parseIdList(tagsRaw),
        },
      }
      if (audienceMode === 'segment') {
        body.segmentId = segmentId
        body.contactIds = []
      } else {
        body.segmentId = ''
        body.contactIds = parseIdList(contactIdsRaw)
      }
      const res = await fetch(`/api/v1/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const respBody = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(respBody.error ?? 'Failed to save')
        return
      }
      setInfo('Saved')
      await loadCampaign()
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleLaunch() {
    if (!campaign) return
    const audienceSize =
      audienceMode === 'segment'
        ? segmentCount ?? 0
        : parseIdList(contactIdsRaw).length
    const confirmed = confirm(
      `Enroll ${audienceSize} contact${audienceSize === 1 ? '' : 's'} and start sending?`,
    )
    if (!confirmed) return
    setError(null)
    setInfo(null)
    setLaunching(true)
    try {
      const res = await fetch(`/api/v1/campaigns/${id}/launch`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Failed to launch')
        return
      }
      const enrolled = body.data?.enrolled ?? 0
      const total = body.data?.audienceSize ?? 0
      setInfo(`Launched. Enrolled ${enrolled} of ${total} contacts.`)
      await loadCampaign()
    } catch {
      setError('Failed to launch')
    } finally {
      setLaunching(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this campaign? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/v1/campaigns/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Failed to delete')
        setDeleting(false)
        return
      }
      router.push('/portal/campaigns')
    } catch {
      setError('Failed to delete')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="pib-skeleton h-20" />
        <div className="pib-skeleton h-40" />
        <div className="pib-skeleton h-40" />
      </div>
    )
  }

  if (notFound || !campaign) {
    return (
      <div className="bento-card p-10 text-center">
        <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">search_off</span>
        <h2 className="font-display text-2xl mt-4">Campaign not found.</h2>
        <p className="text-sm text-[var(--color-pib-text-muted)] mt-2">
          It may have been deleted or you may not have access.
        </p>
        <button onClick={() => router.push('/portal/campaigns')} className="btn-pib-secondary mt-6">
          Back to campaigns
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => router.push('/portal/campaigns')}
          className="text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Campaigns
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editable}
              className="w-full text-2xl md:text-3xl font-display tracking-tight bg-transparent border-b border-[var(--color-pib-line)] text-[var(--color-pib-text)] outline-none pb-1 focus:border-[var(--color-pib-accent)] disabled:opacity-70"
            />
          </div>
          <span className={STATUS_PILL[status] ?? 'pib-pill'}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-pib-secondary disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleLaunch}
                disabled={launching || saving}
                className="btn-pib-accent disabled:opacity-50"
              >
                {launching ? 'Launching…' : 'Launch'}
                <span className="material-symbols-outlined text-base">rocket_launch</span>
              </button>
            </>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-pib-secondary disabled:opacity-50 !text-[#FCA5A5]"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        {error && <p className="text-sm text-[#FCA5A5]">{error}</p>}
        {info && <p className="text-sm text-[var(--color-pib-success)]">{info}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="eyebrow !text-[10px] block mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!editable}
          rows={2}
          placeholder="Optional internal note about the campaign goal."
          className={inputClass}
        />
      </div>

      {/* Sender */}
      <section className="space-y-3">
        <h2 className="eyebrow">Sender</h2>
        <div className="bento-card !p-5 space-y-3">
          <div>
            <label className="block text-xs text-[var(--color-pib-text-muted)] mb-1">
              Sending domain
            </label>
            <select
              value={fromDomainId}
              onChange={(e) => setFromDomainId(e.target.value)}
              disabled={!editable}
              className={inputClass}
            >
              <option value="">{SHARED_DOMAIN_LABEL}</option>
              {domains.map((d) => {
                const isVerified = d.status === 'verified'
                return (
                  <option key={d.id} value={d.id} disabled={!isVerified}>
                    {d.name}
                    {!isVerified ? ` — ${d.status}` : ''}
                  </option>
                )
              })}
            </select>
            {domains.some((d) => d.status !== 'verified') && (
              <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">
                Pending or failed domains can&apos;t be selected. Verify them in Email Domains first.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-pib-text-muted)] mb-1">
                From name
              </label>
              <input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                disabled={!editable}
                placeholder="e.g. Your Brand"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-pib-text-muted)] mb-1">
                From local part
              </label>
              <input
                value={fromLocal}
                onChange={(e) => setFromLocal(e.target.value)}
                disabled={!editable}
                placeholder="campaigns"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-pib-text-muted)] mb-1">
              Reply-to (optional)
            </label>
            <input
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              disabled={!editable}
              placeholder="reply@yourdomain.com"
              className={inputClass}
            />
          </div>
          <p className="text-xs text-[var(--color-pib-text-muted)] font-mono break-all pt-1">
            Preview: {fromPreview}
          </p>
        </div>
      </section>

      {/* Audience */}
      <section className="space-y-3">
        <h2 className="eyebrow">Audience</h2>
        <div className="bento-card !p-5 space-y-3">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="audienceMode"
                value="segment"
                checked={audienceMode === 'segment'}
                onChange={() => setAudienceMode('segment')}
                disabled={!editable}
                className="accent-[var(--color-pib-accent)]"
              />
              Use a segment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="audienceMode"
                value="manual"
                checked={audienceMode === 'manual'}
                onChange={() => setAudienceMode('manual')}
                disabled={!editable}
                className="accent-[var(--color-pib-accent)]"
              />
              Pick contacts manually
            </label>
          </div>

          {audienceMode === 'segment' ? (
            <>
              <select
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                disabled={!editable}
                className={inputClass}
              >
                <option value="">Select a segment…</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--color-pib-text-muted)]">
                {!segmentId
                  ? 'No segment selected.'
                  : segmentCountLoading
                    ? 'Counting matches…'
                    : segmentCount === null
                      ? 'Could not resolve segment.'
                      : `${segmentCount} contact${segmentCount === 1 ? '' : 's'} match`}
              </p>
            </>
          ) : (
            <>
              <textarea
                value={contactIdsRaw}
                onChange={(e) => setContactIdsRaw(e.target.value)}
                disabled={!editable}
                rows={4}
                placeholder="Paste contact IDs (comma- or newline-separated)"
                className={`${inputClass} font-mono`}
              />
              <p className="text-xs text-[var(--color-pib-text-muted)]">
                {parseIdList(contactIdsRaw).length} contact ID
                {parseIdList(contactIdsRaw).length === 1 ? '' : 's'} entered.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="space-y-3">
        <h2 className="eyebrow">Content</h2>
        <div className="bento-card !p-5 space-y-3">
          <div>
            <label className="block text-xs text-[var(--color-pib-text-muted)] mb-1">
              Sequence
            </label>
            <select
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
              disabled={!editable}
              className={inputClass}
            >
              <option value="">Select a sequence…</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.steps?.length ?? 0} steps)
                </option>
              ))}
            </select>
          </div>
          {selectedSequence && (selectedSequence.steps?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-surface-2)]">
              <div className="px-3 py-2 border-b border-[var(--color-pib-line)] eyebrow !text-[10px]">
                Steps preview
              </div>
              <ol className="divide-y divide-[var(--color-pib-line)]">
                {selectedSequence.steps.map((step, idx) => {
                  const snippet =
                    (step.bodyText || step.bodyHtml || '').replace(/\s+/g, ' ').slice(0, 140)
                  return (
                    <li key={idx} className="px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium text-sm truncate">
                          {idx + 1}. {step.subject || '(no subject)'}
                        </p>
                        <span className="text-xs text-[var(--color-pib-text-muted)] whitespace-nowrap font-mono">
                          {step.delayDays === 0
                            ? 'Send immediately'
                            : `+${step.delayDays} day${step.delayDays === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      {snippet && (
                        <p className="text-xs text-[var(--color-pib-text-muted)] mt-0.5 truncate">
                          {snippet}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </div>
      </section>

      {/* Triggers */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setTriggersOpen((v) => !v)}
          className="flex items-center gap-2 eyebrow hover:text-[var(--color-pib-text)] transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">
            {triggersOpen ? 'expand_more' : 'chevron_right'}
          </span>
          Auto-enrollment triggers
        </button>
        {triggersOpen && (
          <div className="bento-card !p-5 space-y-3">
            <div>
              <label className="block text-xs text-[var(--color-pib-text-muted)] mb-1">
                Capture source IDs
              </label>
              <input
                value={captureSourceIdsRaw}
                onChange={(e) => setCaptureSourceIdsRaw(e.target.value)}
                disabled={!editable}
                placeholder="Comma-separated capture source IDs"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-pib-text-muted)] mb-1">
                Tag triggers
              </label>
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                disabled={!editable}
                placeholder="Comma-separated tags"
                className={inputClass}
              />
            </div>
            <p className="text-xs text-[var(--color-pib-text-muted)]">
              Contacts captured from these sources or gaining these tags will be auto-enrolled.
            </p>
          </div>
        )}
      </section>

      {/* Stats */}
      <section className="space-y-3">
        <h2 className="eyebrow">Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: 'Enrolled', value: stats.enrolled },
            { label: 'Sent', value: stats.sent },
            { label: 'Delivered', value: stats.delivered },
            { label: 'Opened', value: stats.opened },
            { label: 'Clicked', value: stats.clicked },
            { label: 'Bounced', value: stats.bounced },
            { label: 'Unsubscribed', value: stats.unsubscribed },
            { label: 'Open rate', value: pct(stats.opened, stats.sent), text: true },
            { label: 'Click rate', value: pct(stats.clicked, stats.sent), text: true },
          ].map((card) => (
            <div key={card.label} className="pib-stat-card">
              <p className="eyebrow !text-[10px]">{card.label}</p>
              <p className="font-display text-2xl tabular-nums mt-2">
                {card.text ? card.value : (card.value as number)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
