'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Sequence } from '@/lib/sequences/types'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-surface-container text-on-surface-variant',
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    fetch('/api/v1/sequences')
      .then((r) => r.json())
      .then((b) => setSequences(b.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function createSequence() {
    if (!newName.trim()) return
    const res = await fetch('/api/v1/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: '', status: 'draft', steps: [] }),
    })
    const body = await res.json()
    if (res.ok) {
      setSequences((prev) => [body.data, ...prev])
      setNewName('')
      setCreating(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-on-surface">Email Sequences</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium"
        >
          New Sequence
        </button>
      </div>

      {creating && (
        <div className="mb-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Sequence name"
            className="flex-1 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-sm"
            onKeyDown={(e) => e.key === 'Enter' && createSequence()}
            autoFocus
          />
          <button onClick={createSequence} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">
            Create
          </button>
          <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-sm">
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">No sequences yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {sequences.map((seq) => (
            <Link
              key={seq.id}
              href={`/admin/sequences/${seq.id}`}
              className="flex items-center justify-between p-4 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
            >
              <div>
                <p className="font-medium text-on-surface">{seq.name}</p>
                {seq.description && <p className="text-sm text-on-surface-variant mt-0.5">{seq.description}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-on-surface-variant">{seq.steps?.length ?? 0} steps</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[seq.status] ?? ''}`}>
                  {seq.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
