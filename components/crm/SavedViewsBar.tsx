'use client'

import { useState, useEffect } from 'react'

interface SavedView {
  id: string
  name: string
  filters: Record<string, unknown>
}

interface Props {
  currentFilters: Record<string, unknown>
  onSelectView: (filters: Record<string, unknown>) => void
  resourceKind?: string
}

export function SavedViewsBar({
  currentFilters,
  onSelectView,
  resourceKind = 'contacts',
}: Props) {
  const [views, setViews] = useState<SavedView[]>([])
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/v1/crm/saved-views?resourceKind=${resourceKind}`)
      if (res.ok) {
        const body = await res.json()
        const raw = body.data?.views ?? body.data ?? []
        setViews(raw)
      }
    } catch {
      // silent — views are non-critical
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceKind])

  async function saveView() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/v1/crm/saved-views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          resourceKind,
          filters: currentFilters,
        }),
      })
      if (res.ok) {
        setNewName('')
        setShowSaveForm(false)
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteView(id: string) {
    if (!confirm('Delete this saved view?')) return
    await fetch(`/api/v1/crm/saved-views/${id}`, { method: 'DELETE' })
    load()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') saveView()
    if (e.key === 'Escape') {
      setShowSaveForm(false)
      setNewName('')
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {views.length > 0 && (
        <div className="flex items-center gap-1">
          <select
            defaultValue=""
            onChange={(e) => {
              const view = views.find((v) => v.id === e.target.value)
              if (view) {
                onSelectView(view.filters)
                // reset so user can pick same view again
                e.target.value = ''
              }
            }}
            className="pib-input !w-auto text-sm"
          >
            <option value="" disabled>
              Saved views
            </option>
            {views.map((v) => (
              <option key={v.id} value={v.id} className="bg-black">
                {v.name}
              </option>
            ))}
          </select>
          {/* Per-view delete buttons */}
          <div className="flex gap-1">
            {views.map((v) => (
              <button
                key={v.id}
                onClick={() => deleteView(v.id)}
                title={`Delete "${v.name}"`}
                className="text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-danger,#FCA5A5)] transition-colors text-xs px-1"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSaveForm ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="View name"
            className="pib-input text-sm !w-40"
          />
          <button
            onClick={saveView}
            disabled={saving || !newName.trim()}
            className="btn-pib-accent !text-xs !px-3 !py-1.5"
          >
            {saving ? '…' : 'Save'}
          </button>
          <button
            onClick={() => {
              setShowSaveForm(false)
              setNewName('')
            }}
            className="text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors"
            aria-label="Cancel"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowSaveForm(true)}
          className="text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-accent)] transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">bookmark_add</span>
          Save view
        </button>
      )}
    </div>
  )
}
