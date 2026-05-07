'use client'

import { useEffect, useState } from 'react'
import { copyToClipboard } from '@/lib/utils/clipboard'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  orgId: string
  role: string
  lastUsedAt?: any
  createdAt?: any
  expiresAt?: any
}

function formatDate(ts: any) {
  if (!ts) return 'Never'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyRole, setNewKeyRole] = useState<'ai' | 'admin'>('ai')
  const [newOrgId, setNewOrgId] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/platform/api-keys')
      .then(r => r.json())
      .then(body => { setKeys(body.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newKeyName.trim()) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/v1/platform/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, role: newKeyRole, orgId: newOrgId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed')
      setCreatedKey(body.data.rawKey)
      setKeys(prev => [...prev, { id: body.data.id, name: newKeyName, keyPrefix: body.data.keyPrefix, orgId: newOrgId, role: newKeyRole, lastUsedAt: null }])
      setNewKeyName('')
      setNewOrgId('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Revoke this API key? Any agents using it will lose access.')) return
    await fetch(`/api/v1/platform/api-keys/${keyId}`, { method: 'DELETE' })
    setKeys(prev => prev.filter(k => k.id !== keyId))
  }

  const inputClass = "w-full px-3 py-2 text-sm bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-[var(--radius-btn)] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-[var(--color-accent-v2)] transition-colors"

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Settings / API Keys</p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">API Keys</h1>
        <p className="text-sm text-on-surface-variant mt-1">Manage API keys for AI agents and integrations.</p>
      </div>

      {/* New key revealed */}
      {createdKey && (
        <div className="pib-card" style={{ borderColor: '#4ade80' }}>
          <p className="text-sm font-bold text-on-surface mb-2">✓ API key created — copy it now</p>
          <p className="text-xs text-on-surface-variant mb-3">This key will only be shown once. Store it securely.</p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs bg-black px-3 py-2 rounded font-mono text-green-400 break-all">{createdKey}</code>
            <button
              onClick={() => { copyToClipboard(createdKey); setCreatedKey(null) }}
              className="pib-btn-primary text-xs font-label shrink-0"
            >
              Copy & Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create new key */}
      <div className="pib-card space-y-4">
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Create New Key</p>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-on-surface-variant block mb-1.5">Key Name *</label>
              <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} className={inputClass} placeholder='e.g. "Social Agent"' />
            </div>
            <div>
              <label className="text-xs text-on-surface-variant block mb-1.5">Role</label>
              <select value={newKeyRole} onChange={e => setNewKeyRole(e.target.value as 'ai' | 'admin')} className={inputClass}>
                <option value="ai">AI Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-on-surface-variant block mb-1.5">Org ID (leave empty for platform-level access)</label>
              <input value={newOrgId} onChange={e => setNewOrgId(e.target.value)} className={inputClass} placeholder="org-id or leave blank for global" />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={creating || !newKeyName.trim()} className="pib-btn-primary font-label">
            {creating ? 'Creating…' : 'Generate Key'}
          </button>
        </form>
      </div>

      {/* Existing keys */}
      <div className="pib-card overflow-hidden !p-0">
        <div className="px-5 py-3 border-b border-[var(--color-card-border)]">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Active Keys</p>
        </div>
        {loading ? (
          <div className="divide-y divide-[var(--color-card-border)]">
            {[1,2].map(i => <div key={i} className="px-5 py-4"><Skeleton className="h-5 w-48" /></div>)}
          </div>
        ) : keys.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-on-surface-variant text-sm">No API keys yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-card-border)]">
            {keys.map(key => (
              <div key={key.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--color-row-hover)] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface">{key.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <code className="text-[10px] font-mono text-on-surface-variant">{key.keyPrefix}••••••••</code>
                    <span className="text-[9px] font-label uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }}>{key.role}</span>
                    {key.orgId && <span className="text-[9px] text-on-surface-variant">org: {key.orgId}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-on-surface-variant">Last used: {formatDate(key.lastUsedAt)}</p>
                </div>
                <button onClick={() => handleRevoke(key.id)} className="text-xs text-on-surface-variant hover:text-red-400 transition-colors font-label shrink-0">
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
