'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { CaptureSource, CaptureSourceType } from '@/lib/crm/captureSources'
import { fmtTimestamp } from '@/components/admin/email/fmtTimestamp'

interface CampaignSummary {
  id: string
  name: string
  status: string
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'

const TYPE_STYLES: Record<CaptureSourceType, string> = {
  form: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  api: 'bg-purple-500/15 text-purple-300 border border-purple-500/25',
  csv: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  integration: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  manual: 'bg-white/10 text-[var(--color-pib-text-muted)] border border-[var(--color-pib-line-strong)]',
}

const TYPE_LABELS: Record<CaptureSourceType, string> = {
  form: 'Form',
  api: 'API',
  csv: 'CSV',
  integration: 'Integration',
  manual: 'Manual',
}

function TypeBadge({ type }: { type: CaptureSourceType }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_STYLES[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // ignore
        }
      }}
      className="px-2.5 py-1 rounded-md text-xs bg-white/[0.04] hover:bg-white/[0.08] text-[var(--color-pib-text)] border border-[var(--color-pib-line)] transition-colors"
      type="button"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function buildSnippet(publicKey: string): string {
  return `<script src="${BASE_URL}/embed/form/${publicKey}" async></script>\n<div data-pib-form></div>`
}

function buildCurl(publicKey: string): string {
  return `curl -X POST ${BASE_URL}/api/public/capture/${publicKey} \\\n  -H 'Content-Type: application/json' \\\n  -d '{"email":"jane@example.com","name":"Jane"}'`
}

function SourceCard({
  source,
  campaigns,
  initiallyExpanded,
  onUpdated,
  onDeleted,
}: {
  source: CaptureSource
  campaigns: CampaignSummary[]
  initiallyExpanded: boolean
  onUpdated: (s: CaptureSource) => void
  onDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(source.name)
  const [tagsDraft, setTagsDraft] = useState((source.autoTags ?? []).join(', '))
  const [redirectDraft, setRedirectDraft] = useState(source.redirectUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setNameDraft(source.name)
    setTagsDraft((source.autoTags ?? []).join(', '))
    setRedirectDraft(source.redirectUrl ?? '')
  }, [source.name, source.autoTags, source.redirectUrl])

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/crm/capture-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to update')
        return
      }
      onUpdated(json.data as CaptureSource)
    } catch {
      setError('Failed to update')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleEnabled() {
    await patch({ enabled: !source.enabled })
  }

  async function handleNameSave() {
    const next = nameDraft.trim()
    setEditingName(false)
    if (!next || next === source.name) {
      setNameDraft(source.name)
      return
    }
    await patch({ name: next })
  }

  async function handleTagsBlur() {
    const next = tagsDraft
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const current = source.autoTags ?? []
    if (next.length === current.length && next.every((t, i) => t === current[i])) return
    await patch({ autoTags: next })
  }

  async function handleRedirectBlur() {
    if (redirectDraft === (source.redirectUrl ?? '')) return
    await patch({ redirectUrl: redirectDraft })
  }

  async function handleConsentChange(v: boolean) {
    await patch({ consentRequired: v })
  }

  async function handleCampaignsChange(ids: string[]) {
    await patch({ autoCampaignIds: ids })
  }

  async function handleRotateKey() {
    if (!confirm('Rotate the public key? Any forms or integrations using the current key will immediately stop working.')) return
    await patch({ rotateKey: true })
  }

  async function handleDelete() {
    if (!confirm(`Delete capture source "${source.name}"? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/crm/capture-sources/${source.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Failed to delete')
        setBusy(false)
        return
      }
      onDeleted(source.id)
    } catch {
      setError('Failed to delete')
      setBusy(false)
    }
  }

  function toggleCampaign(id: string) {
    const set = new Set(source.autoCampaignIds ?? [])
    if (set.has(id)) set.delete(id)
    else set.add(id)
    handleCampaignsChange(Array.from(set))
  }

  const captured = source.capturedCount ?? 0
  const lastAt = fmtTimestamp(source.lastCapturedAt)

  return (
    <div className="rounded-xl bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)]">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="material-symbols-outlined text-[var(--color-pib-text-muted)] text-[20px]">inventory_2</span>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') {
                    setNameDraft(source.name)
                    setEditingName(false)
                  }
                }}
                autoFocus
                className="font-medium bg-[var(--color-pib-bg)] px-2 py-1 rounded-md border border-[var(--color-pib-line-strong)] text-sm w-full max-w-xs text-[var(--color-pib-text)]"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="font-medium text-[var(--color-pib-text)] hover:underline text-left truncate"
                type="button"
                title="Click to rename"
              >
                {source.name}
              </button>
            )}
            <p className="text-xs text-[var(--color-pib-text-muted)] mt-0.5">
              {captured} captured
              {lastAt ? <span> · last {lastAt}</span> : null}
            </p>
          </div>
          <TypeBadge type={source.type} />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--color-pib-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={source.enabled}
              onChange={handleToggleEnabled}
              disabled={busy}
              className="h-4 w-4"
            />
            <span>{source.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-[var(--color-pib-text)] text-sm border border-[var(--color-pib-line)] hover:bg-white/[0.08] transition-colors"
            type="button"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>

      {error && <p className="px-4 pb-2 text-sm text-[#FCA5A5]">{error}</p>}

      {expanded && (
        <div className="border-t border-[var(--color-pib-line)] p-4 space-y-5">
          {/* Public key */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1.5">
              Public ingest key
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs px-2 py-1 rounded-md bg-[var(--color-pib-bg)] border border-[var(--color-pib-line)] break-all text-[var(--color-pib-text)]">
                {source.publicKey}
              </span>
              <CopyButton value={source.publicKey} />
              <button
                onClick={handleRotateKey}
                disabled={busy}
                className="px-2.5 py-1 rounded-md text-xs bg-white/[0.04] hover:bg-white/[0.08] text-[var(--color-pib-text)] border border-[var(--color-pib-line)] transition-colors disabled:opacity-50"
                type="button"
              >
                Rotate
              </button>
            </div>
          </div>

          {/* Snippet (form only) */}
          {source.type === 'form' && (
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1.5">
                Embed snippet
              </label>
              <div className="rounded-md bg-[var(--color-pib-bg)] border border-[var(--color-pib-line)] p-3 font-mono text-xs text-[var(--color-pib-text)] whitespace-pre-wrap break-all">
                {buildSnippet(source.publicKey)}
              </div>
              <div className="mt-2">
                <CopyButton value={buildSnippet(source.publicKey)} label="Copy snippet" />
              </div>
            </div>
          )}

          {/* curl (api only) */}
          {source.type === 'api' && (
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1.5">
                API endpoint
              </label>
              <div className="rounded-md bg-[var(--color-pib-bg)] border border-[var(--color-pib-line)] p-3 font-mono text-xs text-[var(--color-pib-text)] whitespace-pre-wrap break-all">
                {buildCurl(source.publicKey)}
              </div>
              <div className="mt-2">
                <CopyButton value={buildCurl(source.publicKey)} label="Copy curl" />
              </div>
            </div>
          )}

          {/* Auto-tags */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1.5">
              Auto-tags
            </label>
            <input
              value={tagsDraft}
              onChange={(e) => setTagsDraft(e.target.value)}
              onBlur={handleTagsBlur}
              placeholder="lead, website, newsletter"
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-bg)] text-[var(--color-pib-text)] text-sm"
            />
            <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">
              Comma-separated. Applied to every captured contact.
            </p>
          </div>

          {/* Auto-enroll campaigns */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1.5">
              Auto-enroll campaigns
            </label>
            {campaigns.length === 0 ? (
              <p className="text-sm text-[var(--color-pib-text-muted)]">
                No active campaigns to choose from.
              </p>
            ) : (
              <div className="space-y-1.5">
                {campaigns.map((c) => {
                  const checked = (source.autoCampaignIds ?? []).includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-sm text-[var(--color-pib-text)] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCampaign(c.id)}
                        disabled={busy}
                        className="h-4 w-4"
                      />
                      <span>{c.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Form-only: redirect URL + consent */}
          {source.type === 'form' && (
            <>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1.5">
                  Redirect URL
                </label>
                <input
                  value={redirectDraft}
                  onChange={(e) => setRedirectDraft(e.target.value)}
                  onBlur={handleRedirectBlur}
                  placeholder="https://example.com/thanks"
                  type="url"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-bg)] text-[var(--color-pib-text)] text-sm"
                />
                <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">
                  Where the form sends visitors after a successful submit. Leave empty to show a thank-you message in place.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--color-pib-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={source.consentRequired}
                  onChange={(e) => handleConsentChange(e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4"
                />
                <span>Consent required (show explicit opt-in checkbox)</span>
              </label>
            </>
          )}

          {/* Delete */}
          <div className="pt-3 border-t border-[var(--color-pib-line)] flex justify-end">
            <button
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-[#FCA5A5] text-sm border border-[var(--color-pib-line)] hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              type="button"
            >
              Delete source
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PortalCaptureSourcesPage() {
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CaptureSourceType>('form')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadSources = useCallback(() => {
    setLoading(true)
    fetch('/api/v1/crm/capture-sources')
      .then((r) => r.json())
      .then((body) => setSources((body.data ?? []) as CaptureSource[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadCampaigns = useCallback(() => {
    fetch('/api/v1/campaigns?status=active')
      .then((r) => r.json())
      .then((body) => {
        const list = (body.data ?? []) as Array<{ id: string; name: string; status: string }>
        setCampaigns(list.map((c) => ({ id: c.id, name: c.name, status: c.status })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadSources()
    loadCampaigns()
  }, [loadSources, loadCampaigns])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/v1/crm/capture-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: newType }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error ?? 'Failed to create source')
        return
      }
      const created = body.data as CaptureSource
      setSources((prev) => [created, ...prev])
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.add(created.id)
        return next
      })
      setNewName('')
      setNewType('form')
    } catch {
      setFormError('Failed to create source')
    } finally {
      setSubmitting(false)
    }
  }

  function handleUpdated(updated: CaptureSource) {
    setSources((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
  }

  function handleDeleted(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id))
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">CRM</p>
          <h1 className="pib-page-title mt-2">Capture Sources</h1>
          <p className="pib-page-sub max-w-2xl">
            Public ways for contacts to flow into your CRM. Each source has its own ingest key — share the form snippet or call the API endpoint to capture leads.
          </p>
        </div>
        <Link
          href="/portal/capture-sources/import"
          className="btn-pib-secondary !py-2 !px-4 !text-sm"
        >
          <span className="material-symbols-outlined text-base">upload_file</span>
          Import CSV
        </Link>
      </header>

      <div className="rounded-xl bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] p-4">
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Source name (e.g. Homepage form)"
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-bg)] text-[var(--color-pib-text)] text-sm"
            disabled={submitting}
            autoComplete="off"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as CaptureSourceType)}
            className="px-3 py-2 rounded-lg border border-[var(--color-pib-line)] bg-[var(--color-pib-bg)] text-[var(--color-pib-text)] text-sm"
            disabled={submitting}
          >
            <option value="form">Form</option>
            <option value="api">API</option>
            <option value="manual">Manual</option>
          </select>
          <button
            type="submit"
            disabled={submitting || !newName.trim()}
            className="btn-pib-accent !py-2 !px-4 !text-sm disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create'}
          </button>
        </form>
        {formError && <p className="mt-2 text-sm text-[#FCA5A5]">{formError}</p>}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="pib-skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-pib-text-muted)] border border-dashed border-[var(--color-pib-line-strong)] rounded-xl">
          No capture sources yet. Create one above to start collecting contacts.
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              campaigns={campaigns}
              initiallyExpanded={expandedIds.has(s.id)}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
