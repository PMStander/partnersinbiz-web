'use client'
// components/ads/google/MerchantCenterPanel.tsx
// Panel to connect + manage Google Merchant Center bindings.
// Sub-3a Phase 4 Batch 2 Agent D.

import { useEffect, useState } from 'react'
import type { AdMerchantCenter } from '@/lib/ads/types'

interface Props {
  orgSlug: string
  orgId: string
}

export function MerchantCenterPanel({ orgSlug: _orgSlug, orgId }: Props) {
  const [bindings, setBindings] = useState<AdMerchantCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch('/api/v1/ads/google/merchant-center', {
          headers: { 'X-Org-Id': orgId },
        })
        const body = await res.json()
        if (cancelled) return
        if (!body.success) {
          setError(body.error ?? `HTTP ${res.status}`)
          setBindings([])
        } else {
          setBindings((body.data?.bindings ?? []) as AdMerchantCenter[])
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  async function startConnect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/v1/ads/google/merchant-center/oauth/authorize', {
        method: 'POST',
        headers: { 'X-Org-Id': orgId },
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? 'Authorize failed')
      window.location.href = body.data.authorizeUrl
    } catch (err) {
      setConnecting(false)
      alert((err as Error).message)
    }
  }

  async function updateFeedLabel(id: string, primaryFeedLabel: string) {
    try {
      const res = await fetch(`/api/v1/ads/google/merchant-center/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'X-Org-Id': orgId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryFeedLabel }),
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      // Update local state
      setBindings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, primaryFeedLabel } : b)),
      )
    } catch (err) {
      alert((err as Error).message)
    }
  }

  async function disconnect(id: string, merchantId: string) {
    if (!confirm(`Disconnect Merchant Center account ${merchantId}? Shopping campaigns using this account will stop syncing.`)) return
    try {
      const res = await fetch(`/api/v1/ads/google/merchant-center/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-Org-Id': orgId },
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      setBindings((prev) => prev.filter((b) => b.id !== id))
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Google Merchant Center</h2>
          <p className="text-xs text-white/50">
            {loading
              ? 'Loading…'
              : bindings.length === 0
                ? 'No accounts connected'
                : `${bindings.length} account${bindings.length > 1 ? 's' : ''} connected`}
          </p>
        </div>
        {!loading && bindings.length === 0 && (
          <button
            className="btn-pib-accent text-sm"
            onClick={startConnect}
            disabled={connecting}
            aria-label="Connect Merchant Center"
          >
            {connecting ? 'Redirecting…' : 'Connect Merchant Center'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-300 rounded border border-red-500/30 bg-red-500/10 px-3 py-2">
          {error}
        </p>
      )}

      {/* Bindings list */}
      {bindings.map((binding) => {
        const feedLabel = (binding as AdMerchantCenter & { primaryFeedLabel?: string }).primaryFeedLabel ?? ''
        return (
          <div
            key={binding.id}
            className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
            aria-label={`Merchant Center binding ${binding.merchantId}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">Merchant ID: {binding.merchantId}</span>
              </div>
              <button
                className="btn-pib-ghost text-sm"
                onClick={() => disconnect(binding.id, binding.merchantId)}
                aria-label={`Disconnect ${binding.merchantId}`}
              >
                Disconnect
              </button>
            </div>

            {/* Feed label picker */}
            {binding.feedLabels && binding.feedLabels.length > 0 && (
              <div>
                <label className="block text-xs text-white/60 mb-1">
                  Primary feed label
                </label>
                <select
                  className="rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white w-full max-w-xs"
                  value={feedLabel}
                  onChange={(e) => updateFeedLabel(binding.id, e.target.value)}
                  aria-label={`Feed label for ${binding.merchantId}`}
                >
                  <option value="">— select feed label —</option>
                  {binding.feedLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {binding.feedLabels && binding.feedLabels.length === 0 && (
              <p className="text-xs text-white/40">No feed labels available for this account.</p>
            )}
          </div>
        )
      })}

      {/* Add another account (when at least one exists) */}
      {!loading && bindings.length > 0 && (
        <button
          className="btn-pib-ghost text-sm"
          onClick={startConnect}
          disabled={connecting}
          aria-label="Connect another Merchant Center account"
        >
          {connecting ? 'Redirecting…' : '+ Connect another account'}
        </button>
      )}
    </div>
  )
}
