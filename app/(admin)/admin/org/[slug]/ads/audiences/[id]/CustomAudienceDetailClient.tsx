'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdCustomAudienceStatus } from '@/lib/ads/types'

interface Props {
  orgId: string
  orgSlug: string
  caId: string
  currentStatus: AdCustomAudienceStatus
}

export function CustomAudienceDetailClient({ orgId, orgSlug, caId, currentStatus: _currentStatus }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'refresh' | 'delete' | null>(null)

  async function refreshSize() {
    setBusy('refresh')
    try {
      const res = await fetch(`/api/v1/ads/custom-audiences/${caId}/refresh-size`, {
        method: 'POST',
        headers: { 'X-Org-Id': orgId },
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      router.refresh()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function doDelete() {
    if (!confirm('Delete this custom audience? This removes it from PiB and best-effort from Meta.')) return
    setBusy('delete')
    try {
      const res = await fetch(`/api/v1/ads/custom-audiences/${caId}`, {
        method: 'DELETE',
        headers: { 'X-Org-Id': orgId },
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      router.push(`/admin/org/${orgSlug}/ads/audiences`)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-2">
      <button
        className="btn-pib-ghost text-sm"
        onClick={refreshSize}
        disabled={busy !== null}
      >
        {busy === 'refresh' ? 'Refreshing…' : 'Refresh size'}
      </button>
      <button
        className="btn-pib-ghost text-sm text-red-300"
        onClick={doDelete}
        disabled={busy !== null}
      >
        {busy === 'delete' ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  )
}
