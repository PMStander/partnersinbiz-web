'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Content = {
  url: string
  title: string
  description?: string
  image?: string
  favicon?: string
}

export function LinkCardEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const content = (block.content as Content) ?? { url: '', title: '' }

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
        placeholder="Link URL"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={content.title}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="Card title"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <textarea
        value={content.description ?? ''}
        onChange={(e) => update({ description: e.target.value })}
        placeholder="Description (optional)"
        rows={2}
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="url"
        value={content.image ?? ''}
        onChange={(e) => update({ image: e.target.value })}
        placeholder="Image URL (optional)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
    </div>
  )
}
