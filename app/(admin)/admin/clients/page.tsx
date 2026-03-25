'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Client {
  id: string
  name: string
  company: string
  email: string
  uid: string
  contactId: string
  status: 'active' | 'inactive'
  createdAt: unknown
}

function formatDate(val: unknown): string {
  if (!val) return '—'
  // Firestore Timestamp serialised as { _seconds, _nanoseconds } or { seconds, nanoseconds }
  const ts = val as Record<string, number>
  const secs = ts._seconds ?? ts.seconds
  if (secs) return new Date(secs * 1000).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
  if (typeof val === 'string') return new Date(val).toLocaleDateString()
  return '—'
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/v1/clients')
    const body = await res.json()
    setClients(body.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  function openNew() {
    setName('')
    setCompany('')
    setEmail('')
    setNote('')
    setError('')
    setShowNew(true)
  }

  async function createClient() {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    setSaving(true)
    setError('')
    const res = await fetch('/api/v1/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, company, email, note }),
    })
    const body = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(body.error ?? 'Failed to create client.')
      return
    }
    setShowNew(false)
    fetchClients()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-2xl font-bold tracking-tighter">Clients</h1>
          <p className="text-on-surface-variant text-sm mt-0.5">{clients.length} total</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 text-sm font-label text-black bg-on-surface hover:opacity-90 transition-opacity"
        >
          + New Client
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="border border-outline-variant p-12 text-center">
          <p className="text-on-surface-variant mb-3">No clients yet.</p>
          <button onClick={openNew} className="text-sm text-on-surface underline">
            Add your first client →
          </button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left">
              {['Name', 'Company', 'Email', 'Status', 'Created'].map((h) => (
                <th
                  key={h}
                  className="py-2 px-3 text-[10px] font-label uppercase tracking-widest text-on-surface-variant font-normal"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr
                key={c.id}
                className="border-b border-outline-variant hover:bg-surface-container transition-colors"
              >
                <td className="py-2.5 px-3">
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="text-on-surface hover:underline font-medium"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="py-2.5 px-3 text-on-surface-variant">{c.company || '—'}</td>
                <td className="py-2.5 px-3 text-on-surface-variant">{c.email}</td>
                <td className="py-2.5 px-3">
                  {c.status === 'active' ? (
                    <span className="border border-green-700 text-[10px] font-label uppercase tracking-widest px-2 py-0.5 text-green-400">
                      active
                    </span>
                  ) : (
                    <span className="border border-outline-variant text-[10px] font-label uppercase tracking-widest px-2 py-0.5 text-on-surface-variant">
                      inactive
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-on-surface-variant">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Slide-in panel */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setShowNew(false)} />
          <div className="w-96 bg-surface-container border-l border-outline-variant flex flex-col overflow-y-auto">
            <div className="px-6 py-4 border-b border-outline-variant">
              <h2 className="font-headline text-base font-bold tracking-tight">New Client</h2>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4 flex-1">
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="bg-transparent border border-outline-variant px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-on-surface"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
                  Company
                </label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="bg-transparent border border-outline-variant px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-on-surface"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@acme.com"
                  className="bg-transparent border border-outline-variant px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-on-surface"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
                  Note
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Any context about this client…"
                  rows={3}
                  className="bg-transparent border border-outline-variant px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-on-surface resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant flex gap-3">
              <button
                onClick={createClient}
                disabled={saving}
                className="flex-1 py-2 text-sm font-label text-black bg-on-surface hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create Client'}
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-label text-on-surface border border-outline-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
