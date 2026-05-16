'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Content = { headers?: string[]; rows?: string[][] }

export function TableEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const content = (block.content as Content) ?? {}
  const headers = content.headers ?? []
  const rows = content.rows ?? []

  const headersText = headers.join(', ')
  const rowsText = rows.map((r) => r.join(', ')).join('\n')

  const parseHeaders = (text: string): string[] =>
    text.split(',').map((s) => s.trim()).filter((s) => s.length > 0)

  const parseRows = (text: string): string[][] =>
    text
      .split('\n')
      .map((line) => line.split(',').map((s) => s.trim()))
      .filter((row) => row.length > 0 && row.some((c) => c.length > 0))

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. Feature comparison)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={headersText}
        onChange={(e) =>
          onChange({ ...block, content: { headers: parseHeaders(e.target.value), rows } })
        }
        placeholder="Headers (comma separated, e.g. Feature, Starter, Pro)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <textarea
        value={rowsText}
        onChange={(e) =>
          onChange({ ...block, content: { headers, rows: parseRows(e.target.value) } })
        }
        placeholder="Rows (one row per line, cells comma separated)"
        rows={Math.max(4, rows.length + 1)}
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 font-mono text-xs"
      />
      <p className="text-xs opacity-60">
        Tip: One row per line, cells separated by commas.
      </p>
    </div>
  )
}
