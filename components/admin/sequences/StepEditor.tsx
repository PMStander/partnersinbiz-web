'use client'

import { useState } from 'react'
import type { SequenceStep } from '@/lib/sequences/types'

interface Props {
  steps: SequenceStep[]
  onChange: (steps: SequenceStep[]) => void
}

const EMPTY_STEP: Omit<SequenceStep, 'stepNumber'> = {
  delayDays: 1,
  subject: '',
  bodyHtml: '',
  bodyText: '',
}

export default function StepEditor({ steps, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)

  function addStep() {
    const next: SequenceStep = { ...EMPTY_STEP, stepNumber: steps.length + 1 }
    onChange([...steps, next])
    setExpanded(steps.length)
  }

  function updateStep(index: number, field: keyof SequenceStep, value: string | number) {
    const updated = steps.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    onChange(updated)
  }

  function removeStep(index: number) {
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, stepNumber: i + 1 }))
    onChange(updated)
    if (expanded === index) setExpanded(null)
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="rounded-xl border border-outline-variant overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-container text-left"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className="text-sm font-medium text-on-surface">
              Step {step.stepNumber}: {step.subject || '(no subject)'}
            </span>
            <span className="text-xs text-on-surface-variant">
              {step.delayDays === 0 ? 'Immediately' : `+${step.delayDays}d`}
            </span>
          </button>
          {expanded === i && (
            <div className="p-4 bg-surface space-y-3 border-t border-outline-variant">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Subject</label>
                  <input
                    value={step.subject}
                    onChange={(e) => updateStep(i, 'subject', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Delay (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={step.delayDays}
                    onChange={(e) => updateStep(i, 'delayDays', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Body (plain text)</label>
                <textarea
                  value={step.bodyText}
                  onChange={(e) => {
                    updateStep(i, 'bodyText', e.target.value)
                    updateStep(i, 'bodyHtml', `<p>${e.target.value.replace(/\n/g, '</p><p>')}</p>`)
                  }}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm font-mono"
                />
              </div>
              <button
                onClick={() => removeStep(i)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove step
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        onClick={addStep}
        className="w-full py-2 rounded-xl border border-dashed border-outline-variant text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
      >
        + Add step
      </button>
    </div>
  )
}
