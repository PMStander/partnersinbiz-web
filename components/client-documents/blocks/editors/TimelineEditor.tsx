'use client'
import type { DocumentBlock } from '@/lib/client-documents/types'

type Phase = { label: string; duration: string; description?: string }

export function TimelineEditor({
  block,
  onChange,
}: {
  block: DocumentBlock
  onChange: (b: DocumentBlock) => void
}) {
  const phases: Phase[] = ((block.content as { phases?: Phase[] } | null)?.phases) ?? []

  const updatePhase = (i: number, patch: Partial<Phase>) => {
    const next = phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    onChange({ ...block, content: { phases: next } })
  }

  const addPhase = () => {
    onChange({ ...block, content: { phases: [...phases, { label: '', duration: '' }] } })
  }

  const removePhase = (i: number) => {
    onChange({ ...block, content: { phases: phases.filter((_, idx) => idx !== i) } })
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={block.title ?? ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Section title (e.g. Project timeline)"
        className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
      />
      <div className="space-y-3">
        {phases.map((phase, i) => (
          <div
            key={i}
            className="space-y-2 rounded border border-[var(--color-pib-line)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider opacity-70">
                Phase {String(i + 1).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={() => removePhase(i)}
                className="rounded border border-[var(--color-pib-line)] px-2 py-1 text-xs"
                aria-label={`Remove phase ${i + 1}`}
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              value={phase.label}
              onChange={(e) => updatePhase(i, { label: e.target.value })}
              placeholder="Phase label (e.g. Discovery)"
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={phase.duration}
              onChange={(e) => updatePhase(i, { duration: e.target.value })}
              placeholder="Duration (e.g. Week 1-2)"
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
            <textarea
              value={phase.description ?? ''}
              onChange={(e) => updatePhase(i, { description: e.target.value })}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded border border-[var(--color-pib-line)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addPhase}
          className="rounded border border-[var(--color-pib-line)] px-3 py-2 text-xs"
        >
          Add phase
        </button>
      </div>
    </div>
  )
}
