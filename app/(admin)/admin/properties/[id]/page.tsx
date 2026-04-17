// app/(admin)/admin/properties/[id]/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Property } from '@/lib/properties/types'

type Tab = 'overview' | 'config' | 'sequences' | 'creators' | 'analytics' | 'keys'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'config',     label: 'Config' },
  { id: 'sequences',  label: 'Sequences' },
  { id: 'creators',   label: 'Creators' },
  { id: 'analytics',  label: 'Analytics' },
  { id: 'keys',       label: 'Keys' },
]

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

function formatTs(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ property }: { property: Property }) {
  return (
    <div className="space-y-4">
      <div className="pib-card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Name</p>
          <p className="text-on-surface font-medium">{property.name}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Domain</p>
          <p className="text-on-surface font-medium">{property.domain}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Type</p>
          <p className="text-on-surface">{property.type}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Status</p>
          <p className="text-on-surface">{property.status}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Created</p>
          <p className="text-on-surface">{formatTs(property.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant font-label mb-0.5">Creator Link Prefix</p>
          <p className="text-on-surface">{property.creatorLinkPrefix ?? '—'}</p>
        </div>
      </div>
      <div className="pib-card p-4 text-sm text-on-surface-variant">
        <p className="text-xs font-label mb-1">Analytics (coming soon)</p>
        <p>Sessions and events will appear here once the Analytics module is live.</p>
      </div>
    </div>
  )
}

// ── Keys Tab ─────────────────────────────────────────────────────────────────

function KeysTab({ property, onRotate }: { property: Property; onRotate: (key: string) => void }) {
  const [rotating, setRotating] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')

  async function handleRotate() {
    if (!confirm('Rotating the ingest key will break any clients using the old key. Continue?')) return
    setRotating(true)
    setError('')
    try {
      const res = await fetch(`/api/v1/properties/${property.id}/rotate-ingest-key`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Rotation failed')
      onRotate(body.data.ingestKey)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="pib-card p-4 space-y-3">
        <p className="text-xs text-on-surface-variant font-label">Ingest Key</p>
        <p className="text-xs text-on-surface-variant">
          This key is safe to ship in client-side JavaScript. It can only write analytics events
          and fetch this property&apos;s config — it cannot read or modify any other data.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-[var(--color-surface-container)] px-3 py-2 rounded-lg font-mono break-all text-on-surface">
            {showKey ? property.ingestKey : '•'.repeat(32)}
          </code>
          <button
            onClick={() => setShowKey(v => !v)}
            className="pib-btn-secondary text-xs px-3 py-2 shrink-0"
          >
            {showKey ? 'Hide' : 'Reveal'}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant">
          Key rotated: {formatTs(property.ingestKeyRotatedAt)}
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleRotate}
          disabled={rotating}
          className="pib-btn-secondary text-xs font-label text-[var(--color-error,#ef4444)]"
        >
          {rotating ? 'Rotating…' : 'Rotate Key'}
        </button>
      </div>
      <div className="pib-card p-4 text-sm space-y-2">
        <p className="text-xs font-label text-on-surface-variant">Usage</p>
        <pre className="text-xs bg-[var(--color-surface-container)] p-3 rounded-lg overflow-x-auto">
{`// In your micro-site .env
NEXT_PUBLIC_PIB_INGEST_KEY="${property.ingestKey}"
NEXT_PUBLIC_PIB_PROPERTY_ID="${property.id}"

// lib/property-config.ts
const res = await fetch(\`\${PIB_BASE}/properties/\${propertyId}/config\`, {
  headers: { 'x-pib-ingest-key': process.env.NEXT_PUBLIC_PIB_INGEST_KEY! },
  next: { revalidate: 60 },
})
const config = await res.json()`}
        </pre>
      </div>
    </div>
  )
}

// ── Config Tab ────────────────────────────────────────────────────────────

function ConfigTab({ property, onSave }: { property: Property; onSave: (updated: Property) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [appStoreUrl, setAppStoreUrl] = useState(property.config?.appStoreUrl ?? '')
  const [playStoreUrl, setPlayStoreUrl] = useState(property.config?.playStoreUrl ?? '')
  const [primaryCtaUrl, setPrimaryCtaUrl] = useState(property.config?.primaryCtaUrl ?? '')
  const [siteUrl, setSiteUrl] = useState(property.config?.siteUrl ?? '')
  const [killSwitch, setKillSwitch] = useState(property.config?.killSwitch ?? false)
  const [status, setStatus] = useState(property.status)

  const [featureFlagsText, setFeatureFlagsText] = useState(
    JSON.stringify(property.config?.featureFlags ?? {}, null, 2)
  )
  const [customConfigText, setCustomConfigText] = useState(
    JSON.stringify(property.config?.customConfig ?? {}, null, 2)
  )
  const [conversionSequenceId, setConversionSequenceId] = useState(property.conversionSequenceId ?? '')
  const [creatorLinkPrefix, setCreatorLinkPrefix] = useState(property.creatorLinkPrefix ?? '')

  async function handleSave() {
    setSaving(true); setError(''); setSuccess(false)
    let featureFlags: Record<string, boolean | string> = {}
    let customConfig: Record<string, unknown> = {}
    try {
      featureFlags = JSON.parse(featureFlagsText || '{}')
      customConfig = JSON.parse(customConfigText || '{}')
    } catch {
      setError('Feature flags and custom config must be valid JSON.'); setSaving(false); return
    }

    const body = {
      status,
      config: { appStoreUrl, playStoreUrl, primaryCtaUrl, siteUrl, killSwitch, featureFlags, customConfig },
      conversionSequenceId: conversionSequenceId || null,
      creatorLinkPrefix: creatorLinkPrefix || null,
    }

    try {
      const res = await fetch(`/api/v1/properties/${property.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSave(data.data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Status</h2>
        <select value={status} onChange={e => setStatus(e.target.value as any)} className="pib-input text-sm w-48">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Store &amp; CTA URLs</h2>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">App Store URL</label>
          <input type="url" value={appStoreUrl} onChange={e => setAppStoreUrl(e.target.value)} placeholder="https://apps.apple.com/…" className="pib-input text-sm w-full" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Play Store URL</label>
          <input type="url" value={playStoreUrl} onChange={e => setPlayStoreUrl(e.target.value)} placeholder="https://play.google.com/…" className="pib-input text-sm w-full" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Primary CTA URL (fallback)</label>
          <input type="url" value={primaryCtaUrl} onChange={e => setPrimaryCtaUrl(e.target.value)} placeholder="https://…" className="pib-input text-sm w-full" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Canonical Site URL</label>
          <input type="url" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://scrolledbrain.com" className="pib-input text-sm w-full" />
        </div>
      </div>

      <div className="pib-card p-4 space-y-3">
        <h2 className="text-sm font-label font-semibold text-on-surface">Kill Switch</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={killSwitch}
            onChange={e => setKillSwitch(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--color-accent-text)]"
          />
          <span className="text-sm text-on-surface">
            Take site offline immediately (returns 503, CDN bypassed)
          </span>
        </label>
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Feature Flags</h2>
        <p className="text-xs text-on-surface-variant">
          JSON object of key → boolean or string. Example: <code>{`{"cardStyle":"meme","showLeaderboard":true}`}</code>
        </p>
        <textarea
          value={featureFlagsText}
          onChange={e => setFeatureFlagsText(e.target.value)}
          rows={6}
          className="pib-input text-xs font-mono w-full"
          spellCheck={false}
        />
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Custom Config</h2>
        <p className="text-xs text-on-surface-variant">Escape hatch for site-specific config. Any valid JSON object.</p>
        <textarea
          value={customConfigText}
          onChange={e => setCustomConfigText(e.target.value)}
          rows={6}
          className="pib-input text-xs font-mono w-full"
          spellCheck={false}
        />
      </div>

      <div className="pib-card p-4 space-y-4">
        <h2 className="text-sm font-label font-semibold text-on-surface">Integrations</h2>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Conversion Sequence ID</label>
          <input
            type="text"
            value={conversionSequenceId}
            onChange={e => setConversionSequenceId(e.target.value)}
            placeholder="seq_…"
            className="pib-input text-sm w-72"
          />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant font-label block mb-1">Creator Link Prefix</label>
          <input
            type="text"
            value={creatorLinkPrefix}
            onChange={e => setCreatorLinkPrefix(e.target.value)}
            placeholder="sb-"
            className="pib-input text-sm w-48"
          />
          <p className="text-xs text-on-surface-variant mt-1">
            Links with slugs starting with this prefix are attributed to this property.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 font-label">{error}</p>}
      {success && <p className="text-sm text-green-400 font-label">Saved.</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="pib-btn-primary text-sm font-label"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}

// ── Placeholder tabs ──────────────────────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="pib-card p-8 text-center text-on-surface-variant text-sm">
      {label} — coming soon.
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    fetch(`/api/v1/properties/${id}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then(body => { setProperty(body.data); setLoading(false) })
      .catch(() => { setLoading(false); router.push('/admin/properties') })
  }, [id, router])

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-10 w-48 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )

  if (!property) return null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/properties')}
          className="text-on-surface-variant hover:text-on-surface text-sm"
        >
          ← Properties
        </button>
        <span className="text-on-surface-variant">/</span>
        <h1 className="text-xl font-headline font-bold text-on-surface">{property.name}</h1>
        <span className="text-xs text-on-surface-variant font-mono">{property.domain}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-outline-variant)]">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-label border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-[var(--color-accent-text)] text-[var(--color-accent-text)]'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview'  && <OverviewTab property={property} />}
      {activeTab === 'config' && (
        <ConfigTab
          property={property}
          onSave={(updated) => setProperty(updated)}
        />
      )}
      {activeTab === 'sequences' && <PlaceholderTab label="Sequence linking" />}
      {activeTab === 'creators'  && <PlaceholderTab label="Creator links" />}
      {activeTab === 'analytics' && <PlaceholderTab label="Analytics (Module 2)" />}
      {activeTab === 'keys'      && (
        <KeysTab
          property={property}
          onRotate={(key) => setProperty(p => p ? { ...p, ingestKey: key } : p)}
        />
      )}
    </div>
  )
}
