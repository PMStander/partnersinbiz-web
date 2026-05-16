'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CLIENT_DOCUMENT_TEMPLATES } from '@/lib/client-documents/templates'
import type { ClientDocumentType } from '@/lib/client-documents/types'

interface OrgOption {
  id: string
  name: string
  slug: string
}

const TYPE_OPTIONS: Array<{ value: ClientDocumentType; label: string }> = CLIENT_DOCUMENT_TEMPLATES.map(
  (t) => ({ value: t.type, label: t.label })
)

export default function NewDocumentPage() {
  const router = useRouter()

  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [orgId, setOrgId] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ClientDocumentType>('sales_proposal')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derive templateId from type
  const templateId = CLIENT_DOCUMENT_TEMPLATES.find((t) => t.type === type)?.id ?? ''

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then((r) => r.json())
      .then((body) => {
        const list: OrgOption[] = (body.data ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (o: any) => ({ id: o.id, name: o.name, slug: o.slug })
        )
        setOrgs(list)
        if (list.length > 0 && !orgId) setOrgId(list[0].id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/client-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, title: title.trim(), type, templateId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? body.message ?? `Error ${res.status}`)
        return
      }
      const doc = body.data ?? body
      router.push(`/admin/documents/${doc.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href="/admin/documents"
          className="text-xs text-on-surface-variant hover:text-on-surface"
        >
          ← Documents
        </Link>
        <h1 className="text-2xl font-semibold">New Document</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface)] p-6">
        {/* Org selector */}
        <div className="space-y-1.5">
          <label htmlFor="orgId" className="block text-sm font-medium">
            Organisation
          </label>
          <select
            id="orgId"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            required
            className="w-full rounded border border-[var(--color-outline)] bg-[var(--color-surface-variant)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-pib-accent)]"
          >
            {orgs.length === 0 && <option value="">Loading…</option>}
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label htmlFor="title" className="block text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Acme Corp — Sales Proposal Q3 2026"
            required
            className="w-full rounded border border-[var(--color-outline)] bg-[var(--color-surface-variant)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-pib-accent)]"
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <label htmlFor="type" className="block text-sm font-medium">
            Document type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as ClientDocumentType)}
            className="w-full rounded border border-[var(--color-outline)] bg-[var(--color-surface-variant)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-pib-accent)]"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Template info (read-only, derived from type) */}
        {templateId && (
          <p className="text-xs text-on-surface-variant">
            Template: <span className="font-mono">{templateId}</span>
          </p>
        )}

        {error && (
          <p className="rounded bg-red-900/30 px-3 py-2 text-sm text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || !orgId || !title.trim()}
            className="btn-primary rounded px-5 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create document'}
          </button>
          <Link
            href="/admin/documents"
            className="text-sm text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
