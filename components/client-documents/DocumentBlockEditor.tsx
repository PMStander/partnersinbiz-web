'use client'

import type { DocumentBlock } from '@/lib/client-documents/types'
import { getEditor } from './blocks'

export function DocumentBlockEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (block: DocumentBlock) => void
}) {
  const Editor = getEditor(block.type)
  return (
    <div className="rounded border border-[var(--color-pib-line)] bg-[var(--color-pib-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="pill !text-[10px] !py-0.5 !px-2">{block.type}</span>
        {block.locked && <span className="text-[10px] text-amber-400">Locked</span>}
      </div>
      <Editor block={block} onChange={onChange} />
    </div>
  )
}
