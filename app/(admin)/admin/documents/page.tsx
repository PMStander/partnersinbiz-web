import Link from 'next/link'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { DocumentIndex } from '@/components/client-documents/DocumentIndex'
import type { ClientDocument, ClientDocumentStatus } from '@/lib/client-documents/types'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(value: any): any {
  if (value === null || value === undefined) return value
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v)
    return out
  }
  return value
}

const STATUS_TABS: Array<{ label: string; value: ClientDocumentStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Internal Draft', value: 'internal_draft' },
  { label: 'Internal Review', value: 'internal_review' },
  { label: 'Client Review', value: 'client_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Archived', value: 'archived' },
]

export default async function DocumentsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const activeStatus = (params.status ?? 'all') as ClientDocumentStatus | 'all'

  const snap = await adminDb
    .collection('client_documents')
    .where('deleted', '==', false)
    .get()

  const allDocuments = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d) => serialize({ id: d.id, ...(d.data() as any) }) as ClientDocument)
    .sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt as string).getTime() : 0
      const bt = b.createdAt ? new Date(b.createdAt as string).getTime() : 0
      return bt - at
    })

  const documents =
    activeStatus === 'all'
      ? allDocuments
      : allDocuments.filter((d) => d.status === activeStatus)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Client Documents</h1>
          <p className="text-sm text-[var(--color-pib-text-muted)]">
            {allDocuments.length} document{allDocuments.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/documents/new"
          className="btn-primary inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-medium"
        >
          + New Document
        </Link>
      </header>

      {/* Status filter tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--color-outline)] pb-0">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === 'all'
              ? allDocuments.length
              : allDocuments.filter((d) => d.status === tab.value).length
          const isActive = activeStatus === tab.value
          return (
            <Link
              key={tab.value}
              href={tab.value === 'all' ? '/admin/documents' : `/admin/documents?status=${tab.value}`}
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

      <DocumentIndex documents={documents} basePath="/admin/documents" />
    </div>
  )
}
