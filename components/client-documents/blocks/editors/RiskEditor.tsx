'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

export function RiskEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const items: string[] = Array.isArray(block.content)
    ? (block.content as string[])
    : typeof block.content === 'string' && block.content.length > 0
      ? [block.content]
      : []

  const updateItem = (i: number, value: string) => {
    const next = [...items]
    next[i] = value
    onChange({ ...block, content: next })
  }

  const addItem = () => {
    onChange({ ...block, content: [...items, ''] })
  }

  const removeItem = (i: number) => {
    onChange({ ...block, content: items.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. Risks)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder={`Risk ${i + 1}`}
              className="flex-1 rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
              aria-label={`Remove risk ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
        >
          Add risk
        </button>
      </div>
    </div>
  )
}
