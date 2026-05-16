import type { DocumentBlock } from '@/lib/client-documents/types'

export function UnknownEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Block title"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <textarea
        value={
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content, null, 2)
        }
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value)
            onChange({ ...block, content: parsed })
          } catch {
            onChange({ ...block, content: e.target.value })
          }
        }}
        rows={6}
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 font-mono text-xs"
      />
    </div>
  )
}
