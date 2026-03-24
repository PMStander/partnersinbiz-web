// components/admin/crm/ContactForm.tsx
'use client'
import { useState } from 'react'

const STAGES = ['new','contacted','replied','demo','proposal','won','lost'] as const
const TYPES = ['lead','prospect','client','churned'] as const
const SOURCES = ['manual','form','import','outreach'] as const

interface ContactFormProps {
  onSave: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  initial?: Record<string, unknown>
}

export function ContactForm({ onSave, onCancel, initial = {} }: ContactFormProps) {
  const [form, setForm] = useState({
    name: String(initial.name ?? ''),
    email: String(initial.email ?? ''),
    phone: String(initial.phone ?? ''),
    company: String(initial.company ?? ''),
    website: String(initial.website ?? ''),
    source: String(initial.source ?? 'manual'),
    type: String(initial.type ?? 'lead'),
    stage: String(initial.stage ?? 'new'),
    notes: String(initial.notes ?? ''),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, tags: [] })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-on-surface"
      />
    </div>
  )

  const select = (label: string, key: keyof typeof form, options: readonly string[]) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{label}</label>
      <select
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-on-surface"
      >
        {options.map((o) => <option key={o} value={o} className="bg-black">{o}</option>)}
      </select>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
      {field('Name *', 'name')}
      {field('Email *', 'email', 'email')}
      {field('Phone', 'phone')}
      {field('Company', 'company')}
      {field('Website', 'website')}
      {select('Source', 'source', SOURCES)}
      {select('Type', 'type', TYPES)}
      {select('Stage', 'stage', STAGES)}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          className="bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-on-surface resize-none"
        />
      </div>
      {error && <p className="text-[11px]" style={{ color: 'var(--color-accent)' }}>{error}</p>}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 text-sm font-label text-black bg-on-surface hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {saving ? 'Saving…' : 'Save Contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 text-sm font-label text-on-surface-variant border border-outline-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
