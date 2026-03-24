'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import StepEditor from '@/components/admin/sequences/StepEditor'
import type { Sequence, SequenceStep } from '@/lib/sequences/types'

const STATUS_OPTIONS = ['draft', 'active', 'paused'] as const

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [seq, setSeq] = useState<Sequence | null>(null)
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enrollContactId, setEnrollContactId] = useState('')

  useEffect(() => {
    params.then((p) => {
      setId(p.id)
      fetch(`/api/v1/sequences/${p.id}`)
        .then((r) => r.json())
        .then((b) => {
          setSeq(b.data)
          setSteps(b.data?.steps ?? [])
        })
        .finally(() => setLoading(false))
    })
  }, [params])

  async function save() {
    if (!id || !seq) return
    setSaving(true)
    await fetch(`/api/v1/sequences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: seq.name, description: seq.description, status: seq.status, steps }),
    })
    setSaving(false)
  }

  async function enroll() {
    if (!id || !enrollContactId.trim()) return
    await fetch(`/api/v1/sequences/${id}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: [enrollContactId.trim()] }),
    })
    setEnrollContactId('')
  }

  async function deleteSequence() {
    if (!id || !confirm('Delete this sequence?')) return
    await fetch(`/api/v1/sequences/${id}`, { method: 'DELETE' })
    router.push('/admin/sequences')
  }

  if (loading) return <div className="p-6 animate-pulse h-40 bg-surface-container rounded-xl" />
  if (!seq) return <div className="p-6 text-on-surface-variant">Sequence not found.</div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/admin/sequences')} className="text-sm text-on-surface-variant hover:underline">
          ← Sequences
        </button>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={deleteSequence} className="px-4 py-2 rounded-lg bg-surface-container text-red-600 text-sm font-medium">
            Delete
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <input
          value={seq.name}
          onChange={(e) => setSeq({ ...seq, name: e.target.value })}
          className="w-full text-xl font-semibold bg-transparent border-b border-outline-variant text-on-surface outline-none pb-1"
        />
        <input
          value={seq.description}
          onChange={(e) => setSeq({ ...seq, description: e.target.value })}
          placeholder="Description (optional)"
          className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
        />
        <select
          value={seq.status}
          onChange={(e) => setSeq({ ...seq, status: e.target.value as Sequence['status'] })}
          className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Steps</h2>
        <StepEditor steps={steps} onChange={setSteps} />
      </div>

      {seq.status === 'active' && (
        <div>
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Enroll a contact</h2>
          <div className="flex gap-2">
            <input
              value={enrollContactId}
              onChange={(e) => setEnrollContactId(e.target.value)}
              placeholder="Contact ID"
              className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            />
            <button onClick={enroll} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">
              Enroll
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
