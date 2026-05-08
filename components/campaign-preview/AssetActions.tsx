'use client'

import React, { useState } from 'react'
import type { AssetActionsProps } from './types'

export function AssetActions({
  status,
  onApprove,
  onRequestChanges,
  onEdit,
  busy,
}: AssetActionsProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isApproved = status === 'approved' || status === 'published'

  async function handleApprove() {
    if (busy || submitting) return
    setSubmitting(true)
    try {
      await onApprove()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitFeedback() {
    if (!feedback.trim() || submitting) return
    setSubmitting(true)
    try {
      await onRequestChanges(feedback.trim())
      setFeedback('')
      setModalOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  const baseBtn: React.CSSProperties = {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'opacity 0.15s ease',
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleApprove}
          disabled={busy || submitting || isApproved}
          style={{
            ...baseBtn,
            background: '#10B981',
            color: '#fff',
            opacity: busy || submitting || isApproved ? 0.55 : 1,
          }}
        >
          {isApproved ? '✓ Approved' : 'Approve'}
        </button>
        <button
          onClick={() => setModalOpen(true)}
          disabled={busy || submitting}
          style={{
            ...baseBtn,
            background: '#F59E0B',
            color: '#1F1F1F',
            opacity: busy || submitting ? 0.55 : 1,
          }}
        >
          Request Changes
        </button>
        <button
          onClick={onEdit}
          disabled={busy || submitting}
          style={{
            ...baseBtn,
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--color-pib-text, #EDEDED)',
            border: '1px solid rgba(255,255,255,0.16)',
            opacity: busy || submitting ? 0.55 : 1,
          }}
        >
          Edit
        </button>
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => !submitting && setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141416',
              color: '#EDEDED',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 12,
              padding: 20,
              width: '100%',
              maxWidth: 480,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Request changes</div>
            <div style={{ fontSize: 13, color: '#8B8B92', marginBottom: 12 }}>
              What needs to be changed? The team will see this feedback.
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              autoFocus
              placeholder="e.g. Tighten the hook in the first sentence, swap the hero image…"
              rows={5}
              style={{
                width: '100%',
                background: '#0A0A0B',
                color: '#EDEDED',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: 10,
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                style={{
                  ...baseBtn,
                  flex: 'unset',
                  background: 'transparent',
                  color: '#EDEDED',
                  border: '1px solid rgba(255,255,255,0.16)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFeedback}
                disabled={submitting || !feedback.trim()}
                style={{
                  ...baseBtn,
                  flex: 'unset',
                  background: '#F59E0B',
                  color: '#1F1F1F',
                  opacity: submitting || !feedback.trim() ? 0.55 : 1,
                }}
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AssetActions
