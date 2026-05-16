'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

export function GalleryEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const urls: string[] = Array.isArray(block.content) ? (block.content as string[]) : []

  const updateUrl = (i: number, value: string) => {
    const next = [...urls]
    next[i] = value
    onChange({ ...block, content: next })
  }

  const addUrl = () => {
    onChange({ ...block, content: [...urls, ''] })
  }

  const removeUrl = (i: number) => {
    onChange({ ...block, content: urls.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. Past work)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="space-y-2">
        {urls.map((url, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => updateUrl(i, e.target.value)}
              placeholder={`Image URL ${i + 1}`}
              className="flex-1 rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeUrl(i)}
              className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
              aria-label={`Remove image ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addUrl}
          className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
        >
          Add image
        </button>
      </div>
    </div>
  )
}
