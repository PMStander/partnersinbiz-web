'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewOrganizationPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/v1/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description, website, logoUrl }),
      })
      const body = await res.json()
      if (!body.success) { setError(body.error ?? 'Failed to create organisation'); return }
      router.push(`/admin/organizations/${body.data.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/organizations" className="text-sm text-on-surface-variant hover:text-on-surface">
          ← Organisations
        </Link>
        <span className="text-on-surface-variant/30">/</span>
        <h1 className="text-xl font-headline font-bold text-on-surface">New Organisation</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 border border-outline-variant rounded-lg p-6 bg-surface">
        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</p>
        )}

        <div>
          <label className="block text-xs font-label text-on-surface-variant mb-1">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lumen"
            className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-label text-on-surface-variant mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Brief description of this organisation…"
            className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-label text-on-surface-variant mb-1">Website</label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://..."
            type="url"
            className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-label text-on-surface-variant mb-1">Logo URL</label>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://... (optional)"
            className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-sm font-label bg-primary text-on-primary rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Organisation'}
          </button>
          <Link href="/admin/organizations" className="px-4 py-2 text-sm font-label text-on-surface-variant hover:text-on-surface">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
