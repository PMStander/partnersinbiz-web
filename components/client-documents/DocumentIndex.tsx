'use client'

import Link from 'next/link'

import type { ClientDocument } from '@/lib/client-documents/types'

function readable(value: string) {
  return value.replaceAll('_', ' ')
}

function linkedLabel(document: ClientDocument) {
  const linked = document.linked ?? {}
  const fields = Object.entries(linked)
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0
      return Boolean(value)
    })
    .map(([key]) => key)

  return fields.join(', ') || 'Standalone'
}

export function DocumentIndex({
  documents,
  basePath,
}: {
  documents: ClientDocument[]
  basePath: string
}) {
  if (documents.length === 0) {
    return (
      <div className="pib-card p-8 text-center">
        <p className="text-sm text-on-surface-variant">No client documents yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-outline)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface)] text-left text-xs uppercase tracking-[0.18em] text-on-surface-variant">
          <tr>
            <th className="px-4 py-3">Document</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Linked</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id} className="border-t border-[var(--color-outline)]">
              <td className="px-4 py-3">
                <Link href={`${basePath}/${document.id}`} className="font-medium hover:text-[var(--color-pib-accent)]">
                  {document.title}
                </Link>
              </td>
              <td className="px-4 py-3 capitalize text-on-surface-variant">{readable(document.type)}</td>
              <td className="px-4 py-3 capitalize">{readable(document.status)}</td>
              <td className="px-4 py-3 text-on-surface-variant">{linkedLabel(document)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
