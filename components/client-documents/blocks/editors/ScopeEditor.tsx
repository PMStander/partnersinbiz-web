'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Mode = 'list' | 'prose'

function modeOf(block: DocumentBlock): Mode {
  return Array.isArray(block.content) ? 'list' : 'prose'
}

export function ScopeEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const mode = modeOf(block)
  const items = Array.isArray(block.content) ? (block.content as string[]) : []
  const proseText = typeof block.content === 'string' ? block.content : ''

  const setMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'list') {
      const seed = proseText.split('\n').map((s) => s.trim()).filter(Boolean)
      onChange({ ...block, content: seed.length > 0 ? seed : [''] })
    } else {
      onChange({ ...block, content: items.join('\n') })
    }
  }

  const updateItem = (i: number, value: string) => {
    const next = [...items]
    next[i] = value
    onChange({ ...block, content: next })
  }

  const addItem = () => {
    onChange({ ...block, content: [...items, ''] })
  }

  const removeItem = (i: number) => {
    const next = items.filter((_, idx) => idx !== i)
    onChange({ ...block, content: next })
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. In Scope)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode('prose')}
          className={`rounded px-3 py-1 ${mode === 'prose' ? 'bg-[var(--color-pib-accent)] text-black' : 'border border-[var(--color-pib-line)]'}`}
        >
          Prose
        </button>
        <button
          type="button"
          onClick={() => setMode('list')}
          className={`rounded px-3 py-1 ${mode === 'list' ? 'bg-[var(--color-pib-accent)] text-black' : 'border border-[var(--color-pib-line)]'}`}
        >
          List
        </button>
      </div>
      {mode === 'prose' ? (
        <textarea
          value={proseText}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          rows={6}
          placeholder="Describe what's in scope"
          className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
        />
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                placeholder={`Item ${i + 1}`}
                className="flex-1 rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
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
          ))}
          <button
            type="button"
            onClick={addItem}
            className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
          >
            Add item
          </button>
        </div>
      )}
    </div>
  )
}
