'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Item = { q: string; a: string }
type Content = { items: Item[] }

export function FaqEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const items = ((block.content as Content)?.items) ?? []

  const commit = (next: Item[]) => {
    onChange({ ...block, content: { items: next } })
  }

  const updateItem = (i: number, patch: Partial<Item>) => {
    commit(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  const addItem = () => {
    commit([...items, { q: '', a: '' }])
  }

  const removeItem = (i: number) => {
    commit(items.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. Frequently asked questions)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="space-y-2 rounded border border-[var(--color-pib-line)] p-2"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={item.q}
                onChange={(e) => updateItem(i, { q: e.target.value })}
                placeholder={`Question ${i + 1}`}
                className="flex-1 rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
                aria-label={`Remove FAQ ${i + 1}`}
              >
                Remove
              </button>
            </div>
            <textarea
              value={item.a}
              onChange={(e) => updateItem(i, { a: e.target.value })}
              placeholder="Answer"
              rows={3}
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
        >
          Add question
        </button>
      </div>
    </div>
  )
}
