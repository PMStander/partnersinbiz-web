'use client'
import { useState } from 'react'
import type { AdCustomAudience, EngagementType } from '@/lib/ads/types'

interface Props {
  orgId: string
  onComplete?: (ca: AdCustomAudience) => void
  onCancel?: () => void
}

const RETENTION_OPTIONS = [30, 60, 90, 180]

const ENGAGEMENT_TYPES: Array<{ value: EngagementType; label: string; placeholder: string }> = [
  { value: 'PAGE', label: 'Facebook Page', placeholder: 'Facebook Page ID' },
  { value: 'VIDEO', label: 'Video', placeholder: 'Facebook Video ID' },
  { value: 'LEAD_FORM', label: 'Lead Form', placeholder: 'Lead Form ID' },
  { value: 'EVENT', label: 'Event', placeholder: 'Facebook Event ID' },
  { value: 'INSTAGRAM_ACCOUNT', label: 'Instagram Account', placeholder: 'Instagram Account ID' },
]

export function EngagementCABuilder({ orgId, onComplete, onCancel }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [engagementType, setEngagementType] = useState<EngagementType>('PAGE')
  const [sourceObjectId, setSourceObjectId] = useState('')
  const [retentionDays, setRetentionDays] = useState(30)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedType = ENGAGEMENT_TYPES.find((t) => t.value === engagementType)!

  function canSubmit(): boolean {
    return name.trim() !== '' && sourceObjectId.trim() !== ''
  }

  async function submit() {
    if (!canSubmit()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/ads/custom-audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId },
        body: JSON.stringify({
          input: {
            type: 'ENGAGEMENT',
            name,
            description,
            status: 'BUILDING',
            source: {
              kind: 'ENGAGEMENT',
              engagementType,
              sourceObjectId: sourceObjectId.trim(),
              retentionDays,
            },
          },
        }),
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      onComplete?.(body.data as AdCustomAudience)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <label className="block text-sm">
        <span className="font-medium">Audience name</span>
        <input
          className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Audience name"
          disabled={submitting}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Description (optional)</span>
        <input
          className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Description"
          disabled={submitting}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Engagement type</span>
        <select
          className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={engagementType}
          onChange={(e) => {
            setEngagementType(e.target.value as EngagementType)
            setSourceObjectId('')
          }}
          aria-label="Engagement type"
          disabled={submitting}
        >
          {ENGAGEMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Source ID</span>
        <input
          className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={sourceObjectId}
          onChange={(e) => setSourceObjectId(e.target.value)}
          placeholder={selectedType.placeholder}
          aria-label="Source ID"
          disabled={submitting}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Retention</span>
        <select
          className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={retentionDays}
          onChange={(e) => setRetentionDays(Number(e.target.value))}
          aria-label="Retention"
          disabled={submitting}
        >
          {RETENTION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            className="btn-pib-ghost text-sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn-pib-accent text-sm"
          onClick={submit}
          disabled={!canSubmit() || submitting}
        >
          {submitting ? 'Creating…' : 'Create audience'}
        </button>
      </div>
    </div>
  )
}
