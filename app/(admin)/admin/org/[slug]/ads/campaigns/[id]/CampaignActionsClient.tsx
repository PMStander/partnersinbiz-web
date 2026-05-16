'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdEntityStatus } from '@/lib/ads/types'

interface Props {
  orgId: string
  orgSlug: string
  campaignId: string
  status: AdEntityStatus
}

export function CampaignActionsClient({ orgId, orgSlug, campaignId, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'launch' | 'pause' | 'delete' | null>(null)

  async function call(action: 'launch' | 'pause') {
    setBusy(action)
    try {
      const res = await fetch(`/api/v1/ads/campaigns/${campaignId}/${action}`, {
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
    if (!confirm('Delete this campaign? This is permanent in PiB and best-effort archives in Meta.'))
      return
    setBusy('delete')
    try {
      const res = await fetch(`/api/v1/ads/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'X-Org-Id': orgId },
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      router.push(`/admin/org/${orgSlug}/ads/campaigns`)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-2">
      {status !== 'ACTIVE' ? (
        <button
          className="btn-pib-accent text-sm"
          onClick={() => call('launch')}
          disabled={busy !== null}
        >
          {busy === 'launch' ? 'Launching…' : 'Launch'}
        </button>
      ) : (
        <button
          className="btn-pib-ghost text-sm"
          onClick={() => call('pause')}
          disabled={busy !== null}
        >
          {busy === 'pause' ? 'Pausing…' : 'Pause'}
        </button>
      )}
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
