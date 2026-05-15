'use client'

import type { ClientDocument, ClientDocumentVersion, DocumentComment } from '@/lib/client-documents/types'

import { DocumentRenderer } from './DocumentRenderer'
import { DocumentReviewRail } from './DocumentReviewRail'

export function DocumentEditorShell({
  document,
  version,
  comments,
  onPublish,
}: {
  document: ClientDocument
  version: ClientDocumentVersion
  comments: DocumentComment[]
  onPublish?: () => void
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <DocumentRenderer document={document} version={version} />
      </div>
      <div className="border-l border-[var(--color-outline)] bg-[var(--color-surface)] p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <DocumentReviewRail document={document} comments={comments} onPublish={onPublish} />
      </div>
    </div>
  )
}
