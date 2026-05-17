'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TargetingEditor } from '@/components/ads/TargetingEditor'
import type { AdTargeting } from '@/lib/ads/types'

interface Props { orgId: string; orgSlug: string }

const INITIAL_TARGETING: AdTargeting = {
  geo: { countries: ['US'] },
  demographics: { ageMin: 18, ageMax: 65 },
  customAudiences: { include: [], exclude: [] },
}

export function NewSavedAudienceClient({ orgId, orgSlug }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targeting, setTargeting] = useState<AdTargeting>(INITIAL_TARGETING)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/ads/saved-audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId },
        body: JSON.stringify({
          input: { name, description, targeting },
        }),
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      router.push(`/admin/org/${orgSlug}/ads/saved-audiences?created=1`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-5 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">New saved audience</h1>
        <p className="text-sm text-white/60 mt-1">Save targeting once, reuse on any ad set.</p>
      </header>

      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input
          className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. US adults 25-54 high intent"
          aria-label="Name"
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

      <div className="rounded border border-white/10 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-3">Targeting</h2>
        <TargetingEditor orgId={orgId} value={targeting} onChange={setTargeting} />
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn-pib-ghost text-sm"
          onClick={() => router.push(`/admin/org/${orgSlug}/ads/saved-audiences`)}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-pib-accent text-sm"
          onClick={submit}
          disabled={!name.trim() || submitting}
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}
