'use client'

import { useState } from 'react'

interface Props {
  contactId: string
}

export default function ContactBrief({ contactId }: Props) {
  const [brief, setBrief] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/ai/contact-brief/${contactId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to generate brief')
      setBrief(body.data.brief)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl bg-surface-container p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">AI Brief</h3>
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Generating…' : brief ? 'Regenerate' : 'Generate Brief'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {brief ? (
        <p className="text-sm text-on-surface leading-relaxed">{brief}</p>
      ) : !loading && (
        <p className="text-xs text-on-surface-variant">
          Click &quot;Generate Brief&quot; to get an AI summary of this contact&apos;s history and deal status.
        </p>
      )}
      {loading && (
        <div className="space-y-2">
          <div className="h-3 bg-surface-container-high animate-pulse rounded" />
          <div className="h-3 bg-surface-container-high animate-pulse rounded w-4/5" />
          <div className="h-3 bg-surface-container-high animate-pulse rounded w-3/5" />
        </div>
      )}
    </div>
  )
}
