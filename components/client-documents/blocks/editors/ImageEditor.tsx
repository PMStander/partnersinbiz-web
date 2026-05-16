'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Width = 'normal' | 'wide' | 'full'
type Content = {
  url: string
  alt?: string
  caption?: string
  width?: Width
}

const WIDTHS: Width[] = ['normal', 'wide', 'full']

export function ImageEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const content = (block.content as Content) ?? { url: '' }

  const update = (patch: Partial<Content>) => {
    onChange({ ...block, content: { ...content, ...patch } })
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Block title (optional, for editor reference)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="url"
        value={content.url}
        onChange={(e) => update({ url: e.target.value })}
        placeholder="Image URL"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={content.alt ?? ''}
        onChange={(e) => update({ alt: e.target.value })}
        placeholder="Alt text (for accessibility)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={content.caption ?? ''}
        onChange={(e) => update({ caption: e.target.value })}
        placeholder="Caption (optional)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider opacity-70">Width</label>
        <select
          value={content.width ?? 'normal'}
          onChange={(e) => update({ width: e.target.value as Width })}
          className="rounded border border-[var(--color-pib-line)] bg-transparent px-2 py-1 text-sm"
        >
          {WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
