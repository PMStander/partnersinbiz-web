'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function BulkApproveButton({ count }: { count: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function approveAll() {
    if (!confirm(`Approve all ${count} pending ${count === 1 ? 'campaign' : 'campaigns'}? They will be ready to launch.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/v1/portal/ads/campaigns/bulk-approve', { method: 'POST' })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`)
      const { approved, failed } = body.data ?? {}
      if (failed && failed.length > 0) {
        alert(`Approved ${approved.length}. ${failed.length} failed:\n${failed.map((f: { id: string; error: string }) => `${f.id}: ${f.error}`).join('\n')}`)
      }
      router.refresh()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className="btn-pib-accent text-xs px-3 py-1.5"
      onClick={approveAll}
      disabled={busy || count === 0}
    >
      {busy ? 'Approving…' : `Approve all (${count})`}
    </button>
  )
}
