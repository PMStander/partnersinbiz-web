'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type MetricItem = { label: string; value?: string; target?: string; description?: string }

export function MetricsEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const items: MetricItem[] = ((block.content as { items?: MetricItem[] } | null)?.items) ?? []

  const updateItem = (i: number, patch: Partial<MetricItem>) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))
    onChange({ ...block, content: { items: next } })
  }

  const addItem = () => {
    onChange({ ...block, content: { items: [...items, { label: '' }] } })
  }

  const removeItem = (i: number) => {
    onChange({ ...block, content: { items: items.filter((_, idx) => idx !== i) } })
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. Outcomes)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="space-y-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="space-y-2 rounded border border-[var(--color-pib-line)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider opacity-70">Metric {i + 1}</span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="rounded border border-[var(--color-pib-line)] px-2 py-1 text-xs"
                aria-label={`Remove metric ${i + 1}`}
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(i, { label: e.target.value })}
              placeholder="Label (e.g. Revenue)"
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={item.value ?? ''}
              onChange={(e) => updateItem(i, { value: e.target.value })}
              placeholder="Value (e.g. +45%)"
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={item.target ?? ''}
              onChange={(e) => updateItem(i, { target: e.target.value })}
              placeholder="Target (optional, e.g. +30%)"
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
            <textarea
              value={item.description ?? ''}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
        >
          Add metric
        </button>
      </div>
    </div>
  )
}
