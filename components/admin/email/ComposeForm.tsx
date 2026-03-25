// components/admin/email/ComposeForm.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ComposeForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    to: '',
    cc: '',
    subject: '',
    bodyText: '',
  })
  const [mode, setMode] = useState<'send' | 'schedule'>('send')
  const [scheduledFor, setScheduledFor] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError('')

    const cc = form.cc
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const endpoint = mode === 'send' ? '/api/v1/email/send' : '/api/v1/email/schedule'
    const payload: Record<string, unknown> = {
      to: form.to,
      cc,
      subject: form.subject,
      bodyText: form.bodyText,
    }
    if (mode === 'schedule') payload.scheduledFor = scheduledFor

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed')
      router.push('/admin/email')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  const inputCls =
    'bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-on-surface'
  const labelCls = 'text-[10px] font-label uppercase tracking-widest text-on-surface-variant'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-2xl">
      {/* To */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>To *</label>
        <input
          type="email"
          required
          value={form.to}
          onChange={set('to')}
          placeholder="recipient@example.com"
          className={inputCls}
        />
      </div>

      {/* CC */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>CC (comma-separated)</label>
        <input
          type="text"
          value={form.cc}
          onChange={set('cc')}
          placeholder="cc1@example.com, cc2@example.com"
          className={inputCls}
        />
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Subject *</label>
        <input
          type="text"
          required
          value={form.subject}
          onChange={set('subject')}
          className={inputCls}
        />
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Body *</label>
        <textarea
          required
          value={form.bodyText}
          onChange={set('bodyText')}
          rows={10}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* Send / Schedule toggle */}
      <div className="flex gap-3 items-center">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="send"
            checked={mode === 'send'}
            onChange={() => setMode('send')}
            className="accent-on-surface"
          />
          <span className="text-sm text-on-surface-variant font-label">Send now</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="schedule"
            checked={mode === 'schedule'}
            onChange={() => setMode('schedule')}
            className="accent-on-surface"
          />
          <span className="text-sm text-on-surface-variant font-label">Schedule for…</span>
        </label>
      </div>

      {/* Datetime picker — shown only in schedule mode */}
      {mode === 'schedule' && (
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Send at *</label>
          <input
            type="datetime-local"
            required
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className={inputCls}
          />
        </div>
      )}

      {error && (
        <p className="text-[11px]" style={{ color: 'var(--color-accent)' }}>{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={sending}
          className="px-6 py-2 text-sm font-label text-black bg-on-surface hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {sending ? 'Sending…' : mode === 'send' ? 'Send Now' : 'Schedule Email'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/email')}
          className="px-6 py-2 text-sm font-label text-on-surface-variant border border-outline-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
