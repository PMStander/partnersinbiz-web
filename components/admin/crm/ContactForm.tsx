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
        className="pib-input"
      />
    </div>
  )

  const select = (label: string, key: keyof typeof form, options: readonly string[]) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{label}</label>
      <select
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="pib-input"
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
          className="pib-input resize-none"
        />
      </div>
      {error && <p className="text-[11px]" style={{ color: 'var(--color-accent)' }}>{error}</p>}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="pib-btn-primary flex-1 justify-center text-sm font-label disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="pib-btn-secondary flex-1 justify-center text-sm font-label"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
