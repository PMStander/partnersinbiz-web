'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type CalloutVariant = 'info' | 'warning' | 'success'
type Content = { title?: string; body?: string; variant?: CalloutVariant }

const VARIANTS: CalloutVariant[] = ['info', 'warning', 'success']

export function CalloutEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const content = (block.content as Content) ?? {}
  const variant: CalloutVariant = content.variant ?? 'info'

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
        type="text"
        value={content.title ?? ''}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="Callout title (e.g. Heads up)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <textarea
        value={content.body ?? ''}
        onChange={(e) => update({ body: e.target.value })}
        placeholder="Callout body"
        rows={3}
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs uppercase tracking-wider opacity-70">Variant</label>
        <select
          value={variant}
          onChange={(e) => update({ variant: e.target.value as CalloutVariant })}
          className="rounded border border-[var(--color-pib-line)] bg-transparent px-2 py-1 text-sm"
        >
          {VARIANTS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
