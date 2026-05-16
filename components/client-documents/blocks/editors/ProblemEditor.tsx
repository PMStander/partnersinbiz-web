import type { DocumentBlock } from '@/lib/client-documents/types'

export function ProblemEditor({
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
        placeholder="Section title (e.g. The Problem)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <textarea
        value={typeof block.content === 'string' ? block.content : ''}
        onChange={(e) => onChange({ ...block, content: e.target.value })}
        rows={6}
        placeholder="Describe the problem the client faces"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
    </div>
  )
}
