'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  CRM_INTEGRATION_PROVIDERS,
  findProvider,
  type CrmIntegrationProvider,
  type CrmIntegrationStatus,
  type PublicCrmIntegrationView,
  type ProviderRegistryEntry,
} from '@/lib/crm/integrations/types'
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

const STATUS_STYLES: Record<CrmIntegrationStatus, string> = {
  pending: 'bg-gray-200 text-gray-700',
  active: 'bg-green-100 text-green-800',
  syncing: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  paused: 'bg-yellow-100 text-yellow-800',
  disabled: 'bg-gray-200 text-gray-700',
}

const STATUS_LABELS: Record<CrmIntegrationStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  syncing: 'Syncing',
  error: 'Error',
  paused: 'Paused',
  disabled: 'Disabled',
}

function StatusBadge({ status }: { status: CrmIntegrationStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function cadenceLabel(mins: number): string {
  if (!mins) return 'manual'
  if (mins < 60) return `every ${mins} min`
  if (mins === 60) return 'every hour'
  if (mins < 1440) return `every ${Math.round(mins / 60)} h`
  if (mins === 1440) return 'daily'
  return `every ${mins} min`
}

function statsSummary(s: PublicCrmIntegrationView['lastSyncStats']): string {
  return `${s.imported} imported · ${s.created} new · ${s.updated} updated${s.skipped ? ` · ${s.skipped} skipped` : ''}${s.errored ? ` · ${s.errored} errored` : ''}`
}

const CADENCE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Manual only' },
  { value: 60, label: 'Every hour' },
  { value: 240, label: 'Every 4 hours' },
  { value: 1440, label: 'Daily' },
]

function ProviderTile({
  entry,
  onAdd,
}: {
  entry: ProviderRegistryEntry
  onAdd: (p: CrmIntegrationProvider) => void
}) {
  const disabled = entry.comingSoon || entry.configFields.length === 0
  return (
    <button
      type="button"
      onClick={() => !disabled && onAdd(entry.provider)}
      disabled={disabled}
      className={[
        'text-left p-4 rounded-xl border bg-surface-container border-outline-variant transition-colors',
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:bg-surface-container-high cursor-pointer',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-on-surface">{entry.displayName}</span>
        {entry.comingSoon && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-700 uppercase tracking-wide">
            Coming soon
          </span>
        )}
        {!entry.comingSoon && entry.configFields.length === 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 uppercase tracking-wide">
            No setup
          </span>
        )}
      </div>
      <p className="text-xs text-on-surface-variant leading-relaxed">{entry.description}</p>
    </button>
  )
}

function AddIntegrationForm({
  entry,
  orgId,
  onCreated,
  onCancel,
}: {
  entry: ProviderRegistryEntry
  orgId: string
  onCreated: (i: PublicCrmIntegrationView) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(entry.displayName)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/crm/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, provider: entry.provider, name: name.trim(), config }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Failed to create integration')
        return
      }
      onCreated(body.data as PublicCrmIntegrationView)
    } catch {
      setError('Failed to create integration')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-surface-container border border-outline-variant p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-on-surface">Connect {entry.displayName}</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-on-surface-variant hover:text-on-surface"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
        />
      </div>

      {entry.configFields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
            {field.label}{field.required ? ' *' : ''}
          </label>
          <input
            type={field.type === 'password' ? 'password' : 'text'}
            value={config[field.key] ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            required={field.required}
            autoComplete="off"
            className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm font-mono"
          />
          {field.helpText && (
            <p className="text-xs text-on-surface-variant mt-1">{field.helpText}</p>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg bg-surface text-on-surface text-sm border border-outline-variant"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </form>
  )
}

function IntegrationCard({
  integration,
  campaigns,
  onUpdated,
  onDeleted,
}: {
  integration: PublicCrmIntegrationView
  campaigns: CampaignSummary[]
  onUpdated: (i: PublicCrmIntegrationView) => void
  onDeleted: (id: string) => void
}) {
  const entry = findProvider(integration.provider)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagsDraft, setTagsDraft] = useState((integration.autoTags ?? []).join(', '))
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    setTagsDraft((integration.autoTags ?? []).join(', '))
  }, [integration.autoTags])

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/crm/integrations/${integration.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to update')
        return
      }
      onUpdated(json.data as PublicCrmIntegrationView)
    } catch {
      setError('Failed to update')
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/crm/integrations/${integration.id}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Sync failed')
        return
      }
      const data = json.data as { integration: PublicCrmIntegrationView; ok: boolean; error: string }
      onUpdated(data.integration)
      if (!data.ok && data.error) setError(data.error)
    } catch {
      setError('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleTogglePause() {
    const next = integration.status === 'paused' ? 'active' : 'paused'
    await patch({ status: next })
  }

  async function handleDelete() {
    if (!confirm(`Delete integration "${integration.name}"? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/crm/integrations/${integration.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Failed to delete')
        setBusy(false)
        return
      }
      onDeleted(integration.id)
    } catch {
      setError('Failed to delete')
      setBusy(false)
    }
  }

  async function handleTagsBlur() {
    const next = tagsDraft.split(',').map((t) => t.trim()).filter(Boolean)
    const current = integration.autoTags ?? []
    if (next.length === current.length && next.every((t, i) => t === current[i])) return
    await patch({ autoTags: next })
  }

  function toggleCampaign(id: string) {
    const set = new Set(integration.autoCampaignIds ?? [])
    if (set.has(id)) set.delete(id)
    else set.add(id)
    patch({ autoCampaignIds: Array.from(set) })
  }

  async function handleSecretSave(key: string) {
    const v = (secretDrafts[key] ?? '').trim()
    if (!v) return
    await patch({ config: { [key]: v } })
    setSecretDrafts((prev) => ({ ...prev, [key]: '' }))
  }

  const lastSynced = fmtTimestamp(integration.lastSyncedAt)
  const isPaused = integration.status === 'paused'
  const isSyncingState = integration.status === 'syncing' || syncing
  const sensitiveFields = entry?.configFields.filter((f) => f.sensitive) ?? []

  return (
    <div className="rounded-xl bg-surface-container border border-outline-variant">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">extension</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-on-surface truncate">
              {integration.name}
              <span className="ml-2 text-xs text-on-surface-variant font-normal">
                {entry?.displayName ?? integration.provider}
              </span>
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {cadenceLabel(integration.cadenceMinutes)}
              {lastSynced && <span> · last synced {lastSynced}</span>}
            </p>
            {integration.lastSyncedAt && (
              <p className="text-xs text-on-surface-variant mt-0.5">
                {statsSummary(integration.lastSyncStats)}
              </p>
            )}
          </div>
          <StatusBadge status={integration.status} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={busy || isSyncingState || isPaused || integration.status === 'disabled'}
            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
            type="button"
          >
            {isSyncingState ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            onClick={handleTogglePause}
            disabled={busy || integration.status === 'disabled'}
            className="px-3 py-1.5 rounded-lg bg-surface text-on-surface text-sm border border-outline-variant hover:bg-surface-container-high disabled:opacity-50 transition-colors"
            type="button"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-surface text-on-surface text-sm border border-outline-variant hover:bg-surface-container-high transition-colors"
            type="button"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-surface text-red-600 text-sm border border-outline-variant hover:bg-red-50 disabled:opacity-50 transition-colors"
            type="button"
          >
            Delete
          </button>
        </div>
      </div>

      {(error || integration.lastError) && (
        <p className="px-4 pb-2 text-sm text-red-600">{error || integration.lastError}</p>
      )}

      {expanded && (
        <div className="border-t border-outline-variant p-4 space-y-5">
          {/* Config preview */}
          {Object.keys(integration.configPreview).length > 0 && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
                Configuration
              </label>
              <dl className="rounded-md bg-surface border border-outline-variant divide-y divide-outline-variant">
                {Object.entries(integration.configPreview).map(([k, v]) => {
                  const field = entry?.configFields.find((f) => f.key === k)
                  return (
                    <div key={k} className="flex justify-between gap-3 px-3 py-2 text-xs">
                      <dt className="text-on-surface-variant">{field?.label ?? k}</dt>
                      <dd className="font-mono text-on-surface break-all">{v}</dd>
                    </div>
                  )
                })}
              </dl>
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
              placeholder="newsletter, mailchimp"
              className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Comma-separated. Applied to every imported contact.
            </p>
          </div>

          {/* Auto-enroll campaigns */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
              Auto-enroll campaigns
            </label>
            {campaigns.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No active campaigns to choose from.</p>
            ) : (
              <div className="space-y-1.5">
                {campaigns.map((c) => {
                  const checked = (integration.autoCampaignIds ?? []).includes(c.id)
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

          {/* Cadence */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
              Sync cadence
            </label>
            <select
              value={integration.cadenceMinutes}
              onChange={(e) => patch({ cadenceMinutes: Number(e.target.value) })}
              disabled={busy}
              className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            >
              {CADENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Re-enter sensitive config */}
          {sensitiveFields.length > 0 && (
            <div className="space-y-3">
              {sensitiveFields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium uppercase tracking-wide text-on-surface-variant mb-1">
                    Update {f.label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={secretDrafts[f.key] ?? ''}
                      onChange={(e) => setSecretDrafts((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder="Leave blank to keep current"
                      autoComplete="off"
                      className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleSecretSave(f.key)}
                      disabled={busy || !(secretDrafts[f.key] ?? '').trim()}
                      className="px-3 py-1.5 rounded-lg bg-surface text-on-surface text-sm border border-outline-variant disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function IntegrationsPage() {
  const params = useParams()
  const slug = params.slug as string

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgLookupDone, setOrgLookupDone] = useState(false)

  const [integrations, setIntegrations] = useState<PublicCrmIntegrationView[]>([])
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [addingProvider, setAddingProvider] = useState<CrmIntegrationProvider | null>(null)

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
      .catch(() => { if (!cancelled) setOrgLookupDone(true) })
    return () => { cancelled = true }
  }, [slug])

  const loadIntegrations = useCallback((id: string) => {
    setLoading(true)
    fetch(`/api/v1/crm/integrations?orgId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((body) => setIntegrations((body.data ?? []) as PublicCrmIntegrationView[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadCampaigns = useCallback((id: string) => {
    fetch(`/api/v1/campaigns?orgId=${encodeURIComponent(id)}&status=active`)
      .then((r) => r.json())
      .then((body) => {
        const list = (body.data ?? []) as Array<{ id: string; name: string; status: string }>
        setCampaigns(list.map((c) => ({ id: c.id, name: c.name, status: c.status })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgId) return
    loadIntegrations(orgId)
    loadCampaigns(orgId)
  }, [orgId, loadIntegrations, loadCampaigns])

  function handleCreated(created: PublicCrmIntegrationView) {
    setIntegrations((prev) => [created, ...prev])
    setAddingProvider(null)
  }
  function handleUpdated(updated: PublicCrmIntegrationView) {
    setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }
  function handleDeleted(id: string) {
    setIntegrations((prev) => prev.filter((i) => i.id !== id))
  }

  const addingEntry = addingProvider ? findProvider(addingProvider) : null

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          {orgName || 'Workspace'}
        </p>
        <h1 className="text-2xl font-semibold text-on-surface">Integrations</h1>
        <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
          Pull contacts from Mailchimp, HubSpot, Google, and more. Captured contacts are auto-tagged and can auto-enroll into active campaigns.
        </p>
      </div>

      {orgLookupDone && !orgId && (
        <div className="rounded-xl bg-surface-container border border-outline-variant p-4 text-sm text-red-600">
          Could not find an organisation for slug &quot;{slug}&quot;.
        </div>
      )}

      {/* Provider tiles */}
      <div>
        <h2 className="text-sm font-medium text-on-surface mb-3">Available providers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CRM_INTEGRATION_PROVIDERS.map((entry) => (
            <ProviderTile
              key={entry.provider}
              entry={entry}
              onAdd={(p) => setAddingProvider(p)}
            />
          ))}
        </div>
      </div>

      {/* Add form */}
      {addingEntry && orgId && (
        <AddIntegrationForm
          entry={addingEntry}
          orgId={orgId}
          onCreated={handleCreated}
          onCancel={() => setAddingProvider(null)}
        />
      )}

      {/* Active integrations */}
      <div>
        <h2 className="text-sm font-medium text-on-surface mb-3">Connected integrations</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : integrations.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant border border-dashed border-outline-variant rounded-xl">
            No integrations connected yet. Pick a provider above to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {integrations.map((i) => (
              <IntegrationCard
                key={i.id}
                integration={i}
                campaigns={campaigns}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
