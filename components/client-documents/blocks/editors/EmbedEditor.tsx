'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Content = { url: string; height?: number; caption?: string }

export function EmbedEditor({
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
        placeholder="Section title (e.g. Book a call)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="url"
        value={content.url}
        onChange={(e) => update({ url: e.target.value })}
        placeholder="Embed URL (https://...)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider opacity-70">Height (px)</label>
        <input
          type="number"
          value={content.height ?? 500}
          onChange={(e) => update({ height: Number(e.target.value) || 500 })}
          min={100}
          step={50}
          className="w-24 rounded border border-[var(--color-pib-line)] bg-transparent px-2 py-1 text-sm"
        />
      </div>
      <input
        type="text"
        value={content.caption ?? ''}
        onChange={(e) => update({ caption: e.target.value })}
        placeholder="Caption (optional)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
    </div>
  )
}
