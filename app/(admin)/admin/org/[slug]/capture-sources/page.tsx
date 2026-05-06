'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import type { CaptureSource, CaptureSourceType } from '@/lib/crm/captureSources'
import { fmtTimestamp } from '@/components/admin/email/fmtTimestamp'

interface OrganizationSummary {
  id: string
  slug: string
  name: string
}

interface CampaignSummary {
  id: string
  name: string
  status: string
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'

const TYPE_STYLES: Record<CaptureSourceType, string> = {
  form: 'bg-blue-100 text-blue-800',
  api: 'bg-purple-100 text-purple-800',
  csv: 'bg-amber-100 text-amber-800',
  integration: 'bg-emerald-100 text-emerald-800',
  manual: 'bg-gray-200 text-gray-700',
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
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[type]}`}>
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
      className="px-2 py-1 rounded-md text-xs bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
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

  // Keep drafts in sync if parent updates the source (e.g. after a PUT)
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
    <div className="rounded-xl bg-surface-container border border-outline-variant">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">inventory_2</span>
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
                className="font-medium text-on-surface bg-surface px-2 py-1 rounded-md border border-outline-variant text-sm w-full max-w-xs"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="font-medium text-on-surface hover:underline text-left truncate"
                type="button"
                title="Click to rename"
              >
                {source.name}
              </button>
            )}
            <p className="text-xs text-on-surface-variant mt-0.5">
              {captured} captured
              {lastAt ? <span> · last {lastAt}</span> : null}
            </p>
          </div>
          <TypeBadge type={source.type} />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
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
            className="px-3 py-1.5 rounded-lg bg-surface text-on-surface text-sm border border-outline-variant hover:bg-surface-container-high transition-colors"
            type="button"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>

      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}

      {expanded && (
        <div className="border-t border-outline-variant p-4 space-y-5">
          {/* Public key */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
              Public ingest key
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs px-2 py-1 rounded-md bg-surface border border-outline-variant break-all">
                {source.publicKey}
              </span>
              <CopyButton value={source.publicKey} />
              <button
                onClick={handleRotateKey}
                disabled={busy}
                className="px-2 py-1 rounded-md text-xs bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant transition-colors disabled:opacity-50"
                type="button"
              >
                Rotate
              </button>
            </div>
          </div>

          {/* Snippet (form only) */}
          {source.type === 'form' && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
                Embed snippet
              </label>
              <div className="rounded-md bg-surface border border-outline-variant p-3 font-mono text-xs text-on-surface whitespace-pre-wrap break-all">
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
              <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
                API endpoint
              </label>
              <div className="rounded-md bg-surface border border-outline-variant p-3 font-mono text-xs text-on-surface whitespace-pre-wrap break-all">
                {buildCurl(source.publicKey)}
              </div>
              <div className="mt-2">
                <CopyButton value={buildCurl(source.publicKey)} label="Copy curl" />
              </div>
            </div>
          )}

          {/* Auto-tags */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
              Auto-tags
            </label>
            <input
              value={tagsDraft}
              onChange={(e) => setTagsDraft(e.target.value)}
              onBlur={handleTagsBlur}
              placeholder="lead, website, newsletter"
              className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Comma-separated. Applied to every captured contact.
            </p>
          </div>

          {/* Auto-enroll campaigns */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
              Auto-enroll campaigns
            </label>
            {campaigns.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No active campaigns to choose from.
              </p>
            ) : (
              <div className="space-y-1.5">
                {campaigns.map((c) => {
                  const checked = (source.autoCampaignIds ?? []).includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none"
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
                <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
                  Redirect URL
                </label>
                <input
                  value={redirectDraft}
                  onChange={(e) => setRedirectDraft(e.target.value)}
                  onBlur={handleRedirectBlur}
                  placeholder="https://example.com/thanks"
                  type="url"
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
                />
                <p className="text-xs text-on-surface-variant mt-1">
                  Where the form sends visitors after a successful submit. Leave empty to show a thank-you message in place.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
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
          <div className="pt-3 border-t border-outline-variant flex justify-end">
            <button
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-surface text-red-600 text-sm border border-outline-variant hover:bg-red-50 disabled:opacity-50 transition-colors"
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

export default function CaptureSourcesPage() {
  const params = useParams()
  const slug = params.slug as string

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgLookupDone, setOrgLookupDone] = useState(false)

  const [sources, setSources] = useState<CaptureSource[]>([])
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CaptureSourceType>('form')
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

  const loadSources = useCallback((id: string) => {
    setLoading(true)
    fetch(`/api/v1/crm/capture-sources?orgId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((body) => setSources((body.data ?? []) as CaptureSource[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadCampaigns = useCallback((id: string) => {
    fetch(`/api/v1/campaigns?orgId=${encodeURIComponent(id)}&status=active`)
      .then((r) => r.json())
      .then((body) => {
        const list = (body.data ?? []) as Array<{ id: string; name: string; status: string }>
        setCampaigns(
          list.map((c) => ({ id: c.id, name: c.name, status: c.status }))
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgId) return
    loadSources(orgId)
    loadCampaigns(orgId)
  }, [orgId, loadSources, loadCampaigns])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    const name = newName.trim()
    if (!name) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/v1/crm/capture-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, name, type: newType }),
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          {orgName || 'Workspace'}
        </p>
        <h1 className="text-2xl font-semibold text-on-surface">Capture Sources</h1>
        <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
          Public ways for contacts to flow into your CRM. Each source has its own ingest key — share the form snippet or call the API endpoint to capture leads.
        </p>
      </div>

      <div className="rounded-xl bg-surface-container border border-outline-variant p-4">
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Source name (e.g. Homepage form)"
            className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            disabled={submitting || !orgId}
            autoComplete="off"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as CaptureSourceType)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            disabled={submitting || !orgId}
          >
            <option value="form">Form</option>
            <option value="api">API</option>
            <option value="manual">Manual</option>
          </select>
          <button
            type="submit"
            disabled={submitting || !orgId || !newName.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </form>
        {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
        {orgLookupDone && !orgId && (
          <p className="mt-2 text-sm text-red-600">
            Could not find an organisation for slug &quot;{slug}&quot;.
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant rounded-xl">
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
