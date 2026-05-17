'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  orgId: string
  level: 'campaign' | 'adset' | 'ad'
  pibEntityId: string
  size?: 'sm' | 'md'
}

export function RefreshButton({ orgId, level, pibEntityId, size = 'md' }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function trigger() {
    setBusy(true)
    try {
      const res = await fetch('/api/v1/ads/insights/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Id': orgId },
        body: JSON.stringify({ level, pibEntityId }),
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error)
      // Wait a beat for queue to drain, then refresh
      setTimeout(() => router.refresh(), 2000)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      className={`btn-pib-ghost ${size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm'}`}
      onClick={trigger}
      disabled={busy}
    >
      {busy ? 'Refreshing…' : 'Refresh insights'}
    </button>
  )
}
