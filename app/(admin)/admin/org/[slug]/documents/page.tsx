'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { OrgThemedFrame } from '@/components/admin/OrgThemedFrame'
import { DocumentIndex } from '@/components/client-documents/DocumentIndex'
import type { ClientDocument, ClientDocumentStatus } from '@/lib/client-documents/types'

const STATUS_TABS: Array<{ label: string; value: ClientDocumentStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Internal Draft', value: 'internal_draft' },
  { label: 'Internal Review', value: 'internal_review' },
  { label: 'Client Review', value: 'client_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Archived', value: 'archived' },
]

export default function OrgDocumentsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const search = useSearchParams()
  const activeStatus = (search.get('status') ?? 'all') as ClientDocumentStatus | 'all'

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then((r) => r.json())
      .then((body) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const org = (body.data ?? []).find((o: any) => o.slug === slug)
        if (org) {
          setOrgId(org.id)
          setOrgName(org.name)
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    fetch(`/api/v1/client-documents?orgId=${orgId}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return
        setDocuments(body.data ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const filtered =
    activeStatus === 'all' ? documents : documents.filter((d) => d.status === activeStatus)

  return (
    <OrgThemedFrame orgId={orgId} className="-m-6 min-h-screen p-6">
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-on-surface-variant">{orgName}</p>
            <h1 className="text-2xl font-semibold">Client Documents</h1>
            <p className="text-sm text-[var(--color-pib-text-muted)]">
              {documents.length} document{documents.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link
            href={`/admin/org/${slug}/documents/new`}
            className="btn-primary inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-medium"
          >
            + New Document
          </Link>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--color-outline)] pb-0">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === 'all'
                ? documents.length
                : documents.filter((d) => d.status === tab.value).length
            const isActive = activeStatus === tab.value
            const href =
              tab.value === 'all'
                ? `/admin/org/${slug}/documents`
                : `/admin/org/${slug}/documents?status=${tab.value}`
            return (
              <Link
                key={tab.value}
                href={href}
                className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 transition-colors ${
                  isActive
                    ? 'border-[var(--color-pib-accent)] text-[var(--color-pib-accent)]'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1.5 rounded-full bg-[var(--color-surface-variant)] px-1.5 py-0.5 text-[10px]">
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pib-skeleton h-16" />
            ))}
          </div>
        ) : (
          <DocumentIndex documents={filtered} basePath={`/admin/org/${slug}/documents`} />
        )}
      </div>
    </OrgThemedFrame>
  )
}
