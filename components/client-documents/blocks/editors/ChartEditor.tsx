'use client'
import { useEffect, useState } from 'react'
import type { DocumentBlock } from '@/lib/client-documents/types'

type ChartKind = 'bar' | 'pie' | 'line' | 'progress_ring'

const KINDS: ChartKind[] = ['bar', 'pie', 'line', 'progress_ring']

const DEFAULT_DATA: Record<ChartKind, unknown> = {
  bar: [
    { name: 'Jan', value: 12 },
    { name: 'Feb', value: 18 },
    { name: 'Mar', value: 24 },
  ],
  pie: [
    { name: 'Organic', value: 60 },
    { name: 'Paid', value: 25 },
    { name: 'Direct', value: 15 },
  ],
  line: [
    { name: 'W1', value: 3 },
    { name: 'W2', value: 5 },
    { name: 'W3', value: 8 },
    { name: 'W4', value: 13 },
  ],
  progress_ring: { value: 65, max: 100, label: 'Completed' },
}

export function ChartEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const content = (block.content as { kind?: ChartKind; data?: unknown }) ?? {}
  const kind: ChartKind = (content.kind as ChartKind) ?? 'bar'
  const [draft, setDraft] = useState(() =>
    content.data !== undefined ? JSON.stringify(content.data, null, 2) : JSON.stringify(DEFAULT_DATA[kind], null, 2),
  )
  const [error, setError] = useState<string | null>(null)

  // Re-sync draft when block changes externally (e.g. kind switched)
  useEffect(() => {
    if (content.data !== undefined) {
      setDraft(JSON.stringify(content.data, null, 2))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  const updateKind = (next: ChartKind) => {
    const nextData = DEFAULT_DATA[next]
    setDraft(JSON.stringify(nextData, null, 2))
    setError(null)
    onChange({ ...block, content: { ...content, kind: next, data: nextData } })
  }

  const updateData = (text: string) => {
    setDraft(text)
    try {
      const parsed = JSON.parse(text)
      setError(null)
      onChange({ ...block, content: { ...content, kind, data: parsed } })
    } catch (e) {
      setError((e as Error).message || 'Invalid JSON')
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Chart title (optional)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider opacity-70">Kind</label>
        <select
          value={kind}
          onChange={(e) => updateKind(e.target.value as ChartKind)}
          className="rounded border border-[var(--color-pib-line)] bg-transparent px-2 py-1 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={draft}
        onChange={(e) => updateData(e.target.value)}
        placeholder="Chart data JSON"
        rows={8}
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 font-mono text-xs"
      />
      {error && <p className="text-xs text-red-500">Invalid JSON: {error}</p>}
    </div>
  )
}
