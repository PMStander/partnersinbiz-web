'use client'

import { useState } from 'react'
import type { CaptureField, CaptureWidgetTheme } from '@/lib/lead-capture/types'

interface Props {
  sourceId: string
  theme: CaptureWidgetTheme
  fields: CaptureField[]
  successMessage: string
  successRedirectUrl: string
  submitUrl: string
}

interface SubmitResponse {
  ok: boolean
  error?: string
  message?: string
  requiresConfirmation?: boolean
  redirect?: string
}

export function LeadCaptureEmbedForm(props: Props) {
  const { theme, fields, submitUrl, successMessage } = props
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ requiresConfirmation: boolean; message: string } | null>(null)
  const [email, setEmail] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    setSubmitting(true)
    try {
      const referer = typeof document !== 'undefined' ? document.referrer : ''
      const res = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), data: values, referer }),
      })
      const body: SubmitResponse = await res.json().catch(() => ({ ok: false } as SubmitResponse))
      if (!res.ok || !body.ok) {
        setError(body.error || 'Submission failed. Please try again.')
        setSubmitting(false)
        return
      }
      setDone({
        requiresConfirmation: !!body.requiresConfirmation,
        message: body.message || successMessage,
      })
      if (body.redirect) {
        setTimeout(() => {
          window.location.href = body.redirect as string
        }, 1200)
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[lead-capture] submit error', err)
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const containerStyle: React.CSSProperties = {
    background: theme.backgroundColor || '#ffffff',
    color: theme.textColor || '#111827',
    padding: '24px',
    borderRadius: `${theme.borderRadius || 12}px`,
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif',
    fontSize: '15px',
    lineHeight: 1.5,
    maxWidth: '460px',
    margin: '0 auto',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
    boxSizing: 'border-box',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid rgba(0,0,0,0.18)',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#111',
  }

  if (done) {
    return (
      <div style={containerStyle}>
        <h3 style={{ margin: '0 0 8px', fontSize: 20, color: theme.textColor || '#111827', textAlign: 'center' }}>
          {done.requiresConfirmation ? 'Check your inbox' : 'Thanks!'}
        </h3>
        <p style={{ margin: 0, color: theme.textColor || '#475569', opacity: 0.8, textAlign: 'center' }}>
          {done.message}
        </p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 600, color: theme.textColor || '#111827' }}>
        {theme.headingText || 'Join our newsletter'}
      </h3>
      {theme.subheadingText ? (
        <p style={{ margin: '0 0 18px', color: theme.textColor || '#475569', opacity: 0.8, fontSize: 14 }}>
          {theme.subheadingText}
        </p>
      ) : null}

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        {fields.filter((f) => f.key !== 'email').map((field) => {
          const v = values[field.key] ?? ''
          const lbl = `${field.label}${field.required ? ' *' : ''}`
          if (field.type === 'textarea') {
            return (
              <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 500 }}>{lbl}</label>
                <textarea
                  required={field.required}
                  value={v}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.placeholder || field.label}
                  rows={4}
                  style={inputStyle}
                />
              </div>
            )
          }
          if (field.type === 'select') {
            return (
              <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 500 }}>{lbl}</label>
                <select
                  required={field.required}
                  value={v}
                  onChange={(e) => setField(field.key, e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{field.placeholder || field.label}</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )
          }
          return (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>{lbl}</label>
              <input
                type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
                required={field.required}
                value={v}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder || field.label}
                style={inputStyle}
              />
            </div>
          )
        })}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 6,
            padding: '12px 16px',
            background: theme.primaryColor || '#0f766e',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {submitting ? 'Submitting…' : theme.buttonText || 'Subscribe'}
        </button>

        {error ? <div style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div> : null}
      </form>
    </div>
  )
}
