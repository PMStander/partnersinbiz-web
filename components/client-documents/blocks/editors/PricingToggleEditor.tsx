'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Item = { label: string; amount: number; required?: boolean; default?: boolean }
type Content = { items: Item[]; currency: string; note?: string }

const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP'] as const

export function PricingToggleEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const content = (block.content as Content) ?? { items: [], currency: 'ZAR' }
  const items = content.items ?? []
  const currency = content.currency ?? 'ZAR'
  const note = content.note ?? ''

  const commit = (patch: Partial<Content>) => {
    onChange({
      ...block,
      content: {
        items: patch.items ?? items,
        currency: patch.currency ?? currency,
        note: patch.note ?? note,
      },
    })
  }

  const updateItem = (i: number, patch: Partial<Item>) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))
    commit({ items: next })
  }

  const addItem = () => {
    commit({ items: [...items, { label: '', amount: 0 }] })
  }

  const removeItem = (i: number) => {
    commit({ items: items.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. Build your package)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />

      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider opacity-70">Currency</label>
        <select
          value={currency}
          onChange={(e) => commit({ currency: e.target.value })}
          className="rounded border border-[var(--color-pib-line)] bg-transparent px-2 py-1 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded border border-[var(--color-pib-line)] p-2 text-sm"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(i, { label: e.target.value })}
                placeholder={`Line item ${i + 1}`}
                className="flex-1 rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={item.amount}
                onChange={(e) => updateItem(i, { amount: Number(e.target.value) || 0 })}
                placeholder="Amount"
                className="w-32 rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
                aria-label={`Remove item ${i + 1}`}
              >
                Remove
              </button>
            </div>
            <div className="mt-2 flex items-center gap-4">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(item.required)}
                  onChange={(e) => updateItem(i, { required: e.target.checked })}
                />
                Required
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(item.default)}
                  onChange={(e) => updateItem(i, { default: e.target.checked })}
                />
                Selected by default
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
        >
          Add line item
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => commit({ note: e.target.value })}
        placeholder="Note (optional)"
        rows={2}
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
    </div>
  )
}
