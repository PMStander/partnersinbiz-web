'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Tab = 'settings' | 'members' | 'accounts' | 'client'

interface OrgDetail {
  id: string
  name: string
  slug: string
  description: string
  logoUrl: string
  website: string
  active: boolean
  members: Array<{ userId: string; role: string }>
  linkedClientId: string
  createdAt?: unknown
}

interface Account { id: string; platform: string; displayName: string; status: string }
interface Client { id: string; name: string; company: string; email: string }

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('settings')
  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state for settings tab
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  // Member management
  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('member')

  // Client link
  const [selectedClientId, setSelectedClientId] = useState('')

  const fetchOrg = useCallback(async () => {
    const res = await fetch(`/api/v1/organizations/${id}`)
    const body = await res.json()
    if (!body.success) { setError('Organisation not found'); return }
    setOrg(body.data)
    setName(body.data.name)
    setDescription(body.data.description ?? '')
    setWebsite(body.data.website ?? '')
    setLogoUrl(body.data.logoUrl ?? '')
    setSelectedClientId(body.data.linkedClientId ?? '')
  }, [id])

  const fetchAccounts = useCallback(async () => {
    const res = await fetch(`/api/v1/organizations/${id}/accounts`)
    const body = await res.json()
    setAccounts(body.data ?? [])
  }, [id])

  const fetchClients = useCallback(async () => {
    const res = await fetch('/api/v1/clients')
    const body = await res.json()
    setClients(body.data ?? [])
  }, [])

  useEffect(() => {
    Promise.all([fetchOrg(), fetchAccounts(), fetchClients()]).finally(() => setLoading(false))
  }, [fetchOrg, fetchAccounts, fetchClients])

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/v1/organizations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, website, logoUrl }),
      })
      const body = await res.json()
      if (!body.success) { setError(body.error ?? 'Save failed'); return }
      await fetchOrg()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${org?.name}"? This is a soft delete — it can be restored.`)) return
    const res = await fetch(`/api/v1/organizations/${id}`, { method: 'DELETE' })
    const body = await res.json()
    if (body.success) router.push('/admin/organizations')
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!newMemberUserId.trim()) return
    const res = await fetch(`/api/v1/organizations/${id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: newMemberUserId.trim(), role: newMemberRole }),
    })
    const body = await res.json()
    if (!body.success) { setError(body.error ?? 'Failed to add member'); return }
    setNewMemberUserId('')
    await fetchOrg()
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remove this member?')) return
    const res = await fetch(`/api/v1/organizations/${id}/members/${userId}`, { method: 'DELETE' })
    const body = await res.json()
    if (!body.success) { setError(body.error ?? 'Failed to remove member'); return }
    await fetchOrg()
  }

  async function handleLinkClient(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClientId) return
    const res = await fetch(`/api/v1/organizations/${id}/link-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: selectedClientId }),
    })
    const body = await res.json()
    if (!body.success) { setError(body.error ?? 'Failed to link client'); return }
    await fetchOrg()
  }

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'settings', label: 'Settings' },
    { key: 'members', label: `Members (${org?.members?.length ?? 0})` },
    { key: 'accounts', label: `Social Accounts (${accounts.length})` },
    { key: 'client', label: 'Linked Client' },
  ]

  if (loading) return <div className="text-sm text-on-surface-variant">Loading…</div>
  if (!org) return <div className="text-sm text-red-400">{error || 'Organisation not found'}</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/organizations" className="text-sm text-on-surface-variant hover:text-on-surface">
          ← Organisations
        </Link>
        <span className="text-on-surface-variant/30">/</span>
        <h1 className="text-xl font-headline font-bold text-on-surface">{org.name}</h1>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setError('') }}
            className={`px-4 py-2 text-sm font-label border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Settings Tab */}
      {tab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="block text-xs font-label text-on-surface-variant mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-label text-on-surface-variant mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface focus:outline-none focus:border-primary resize-none" />
          </div>
          <div>
            <label className="block text-xs font-label text-on-surface-variant mb-1">Website</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} type="url"
              className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-label text-on-surface-variant mb-1">Logo URL</label>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface focus:outline-none focus:border-primary" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-label bg-primary text-on-primary rounded hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={handleDelete}
              className="px-4 py-2 text-sm font-label text-red-400 border border-red-400/30 rounded hover:bg-red-400/10">
              Delete Organisation
            </button>
          </div>
        </form>
      )}

      {/* Members Tab */}
      {tab === 'members' && (
        <div className="space-y-4">
          <form onSubmit={handleAddMember} className="flex gap-2">
            <input
              value={newMemberUserId}
              onChange={(e) => setNewMemberUserId(e.target.value)}
              placeholder="User ID"
              className="flex-1 px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface focus:outline-none focus:border-primary"
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              className="px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <button type="submit"
              className="px-4 py-2 text-sm font-label bg-primary text-on-primary rounded hover:opacity-90">
              Add
            </button>
          </form>

          <div className="border border-outline-variant rounded-lg overflow-hidden">
            {(org.members ?? []).length === 0 && (
              <p className="text-sm text-on-surface-variant p-4">No members yet.</p>
            )}
            {(org.members ?? []).map((m) => (
              <div key={m.userId} className="flex items-center justify-between px-4 py-3 border-b border-outline-variant last:border-b-0">
                <div>
                  <p className="text-sm font-label text-on-surface">{m.userId}</p>
                  <p className="text-xs text-on-surface-variant/60 capitalize">{m.role}</p>
                </div>
                <button onClick={() => handleRemoveMember(m.userId)}
                  className="text-xs text-red-400 hover:text-red-300">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Social Accounts Tab */}
      {tab === 'accounts' && (
        <div className="space-y-3">
          {accounts.length === 0 && (
            <p className="text-sm text-on-surface-variant">No social accounts connected to this organisation.</p>
          )}
          {accounts.map((acct) => (
            <div key={acct.id} className="flex items-center justify-between border border-outline-variant rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-label text-on-surface capitalize">{acct.platform}</p>
                <p className="text-xs text-on-surface-variant">{acct.displayName}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded border font-label ${
                acct.status === 'active' ? 'border-green-400/40 text-green-300' : 'border-red-400/40 text-red-300'
              }`}>
                {acct.status}
              </span>
            </div>
          ))}
          <Link
            href="/admin/social/accounts"
            className="inline-block text-sm text-primary hover:underline mt-2"
          >
            Manage accounts →
          </Link>
        </div>
      )}

      {/* Linked Client Tab */}
      {tab === 'client' && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            Link this organisation to a client record. The client portal user will automatically see this org's social activity.
          </p>
          {org.linkedClientId && (
            <div className="border border-primary/30 rounded-lg px-4 py-3 bg-primary/5">
              <p className="text-xs font-label text-on-surface-variant mb-0.5">Currently linked</p>
              <p className="text-sm text-on-surface font-semibold">
                {clients.find((c) => c.id === org.linkedClientId)?.name ?? org.linkedClientId}
              </p>
            </div>
          )}
          <form onSubmit={handleLinkClient} className="flex gap-2">
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="">— Select a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>
              ))}
            </select>
            <button type="submit" disabled={!selectedClientId}
              className="px-4 py-2 text-sm font-label bg-primary text-on-primary rounded hover:opacity-90 disabled:opacity-50">
              Link Client
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
