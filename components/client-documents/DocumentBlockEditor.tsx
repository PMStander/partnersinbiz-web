'use client'

import { useState } from 'react'
import type { DocumentBlock } from '@/lib/client-documents/types'

function blockContent(block: DocumentBlock): string {
  if (typeof block.content === 'string') return block.content
  if (block.content && typeof block.content === 'object' && !Array.isArray(block.content)) {
    const body = (block.content as Record<string, unknown>).body
    if (typeof body === 'string') return body
  }
  return JSON.stringify(block.content, null, 2)
}

function hint(type: DocumentBlock['type']): string | null {
  switch (type) {
    case 'investment':
      return 'Use markdown table for pricing'
    case 'timeline':
      return 'Use markdown: `## Phase 1 — Name\n**Dates:** ...\n**Deliverables:** ...`'
    case 'table':
      return 'Paste JSON array of objects'
    case 'scope':
    case 'deliverables':
      return 'Use a markdown list (- item)'
    default:
      return null
  }
}

export function DocumentBlockEditor({
  block,
  onSave,
  readOnly = false,
}: {
  block: DocumentBlock
  onSave: (updated: DocumentBlock) => void
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(blockContent(block))
  const hintText = hint(block.type)
  const isLocked = block.locked && block.type === 'terms'

  function handleSave() {
    onSave({ ...block, content: value })
    setEditing(false)
  }

  function handleCancel() {
    setValue(blockContent(block))
    setEditing(false)
  }

  const calloutBorder = block.type === 'callout' ? 'border-l-4 border-[var(--color-pib-accent)] pl-4' : ''

  return (
    <div className={`group relative py-6 border-b border-white/10 ${calloutBorder}`}>
      {/* Block header */}
      <div className="flex items-center justify-between mb-3">
        {block.title && (
          <h2 className="text-xl font-semibold text-[var(--doc-accent)]">{block.title}</h2>
        )}
        {!block.title && (
          <h2 className="text-xs uppercase tracking-widest text-white/40">{block.type.replaceAll('_', ' ')}</h2>
        )}
        <div className="flex items-center gap-2">
          {isLocked && (
            <span title="This block is locked" className="text-white/40 text-xs">🔒 Locked</span>
          )}
          {!readOnly && !isLocked && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-white/40 hover:text-[var(--doc-accent)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          {hintText && (
            <p className="text-xs text-white/40 italic">{hintText}</p>
          )}
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={8}
            className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none focus:border-[var(--doc-accent)] resize-y font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="rounded bg-[var(--doc-accent)] px-3 py-1.5 text-xs font-medium text-black"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="rounded border border-white/20 px-3 py-1.5 text-xs text-white/60 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-7 text-white/80">
          {blockContent(block)}
        </div>
      )}
    </div>
  )
}
