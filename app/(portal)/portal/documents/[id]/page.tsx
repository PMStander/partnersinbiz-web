'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DocumentRenderer } from '@/components/client-documents/DocumentRenderer'
import { DocumentReviewRail } from '@/components/client-documents/DocumentReviewRail'
import type { ClientDocument, ClientDocumentVersion, DocumentComment } from '@/lib/client-documents/types'

interface Props {
  params: { id: string }
}

export default function PortalDocumentDetail({ params }: Props) {
  const { id } = params
  const [doc, setDoc] = useState<ClientDocument | null>(null)
  const [version, setVersion] = useState<ClientDocumentVersion | null>(null)
  const [comments, setComments] = useState<DocumentComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)

  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const [docRes, versionsRes, commentsRes] = await Promise.all([
          fetch(`/api/v1/client-documents/${id}`),
          fetch(`/api/v1/client-documents/${id}/versions`),
          fetch(`/api/v1/client-documents/${id}/comments`),
        ])

        const docData = await docRes.json()
        const versionsData = await versionsRes.json()
        const commentsData = await commentsRes.json()

        const document: ClientDocument = docData.data ?? docData
        setDoc(document)
        setComments(commentsData.data ?? [])

        const versions: ClientDocumentVersion[] = versionsData.data ?? []
        const current =
          versions.find((v) => v.id === document.currentVersionId) ??
          versions.find((v) => v.status === 'published') ??
          versions[versions.length - 1] ??
          null
        setVersion(current)
      } catch {
        // silently fail — show empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function submitComment() {
    if (!newComment.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/client-documents/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newComment.trim() }),
      })
      if (res.ok) {
        const body = await res.json()
        const saved: DocumentComment = body.data ?? body
        setComments((prev) => [...prev, saved])
        setNewComment('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove() {
    if (!doc) return
    if (doc.approvalMode === 'formal_acceptance') {
      setShowApproveModal(true)
      return
    }
    // operational
    setApproving(true)
    try {
      await fetch(`/api/v1/client-documents/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setApproved(true)
      setDoc((prev) => prev ? { ...prev, status: 'approved' } : prev)
    } finally {
      setApproving(false)
    }
  }

  async function handleFormalAccept() {
    if (!typedName.trim() || !agreed || approving) return
    setApproving(true)
    try {
      await fetch(`/api/v1/client-documents/${id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typedName: typedName.trim(),
          checkboxText: 'I have read and agree to the terms above',
        }),
      })
      setApproved(true)
      setShowApproveModal(false)
      setDoc((prev) => prev ? { ...prev, status: 'accepted' } : prev)
    } finally {
      setApproving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="pib-skeleton h-8 w-32" />
        <div className="pib-skeleton h-64" />
        <div className="pib-skeleton h-40" />
      </div>
    )
  }

  if (!doc || !version) {
    return (
      <div className="space-y-6">
        <Link href="/portal/documents" className="flex items-center gap-1 text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-accent)]">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Documents
        </Link>
        <div className="bento-card p-10 text-center">
          <h2 className="font-display text-2xl">Document not found.</h2>
        </div>
      </div>
    )
  }

  const canApprove =
    doc.clientPermissions.canApprove &&
    doc.status === 'client_review' &&
    !approved

  return (
    <div className="space-y-6">
      <Link
        href="/portal/documents"
        className="flex items-center gap-1 text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-accent)]"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Back to Documents
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 rounded-xl overflow-hidden">
          <DocumentRenderer document={doc} version={version} />
        </div>

        <aside className="space-y-4">
          <DocumentReviewRail document={doc} comments={comments} />

          {/* Add comment */}
          {doc.clientPermissions.canComment && (
            <div className="pib-card p-4 space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-on-surface-variant">Leave a comment</p>
              <textarea
                ref={commentInputRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                placeholder="Type your comment…"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[var(--color-pib-accent)] resize-none"
              />
              <button
                type="button"
                onClick={submitComment}
                disabled={!newComment.trim() || submitting}
                className="w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-pib-accent)', color: '#000' }}
              >
                {submitting ? 'Sending…' : 'Send comment'}
              </button>
            </div>
          )}

          {/* Approve button */}
          {canApprove && (
            <div className="pib-card p-4">
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving}
                className="w-full rounded-md px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-pib-accent)', color: '#000' }}
              >
                {approving ? 'Approving…' : 'Approve Document'}
              </button>
            </div>
          )}

          {approved && (
            <div className="pib-card p-4 text-center">
              <span className="material-symbols-outlined text-2xl text-green-400">check_circle</span>
              <p className="mt-1 text-sm font-medium">Document approved — thank you!</p>
            </div>
          )}
        </aside>
      </div>

      {/* Formal acceptance modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="pib-card w-full max-w-md space-y-4 p-6">
            <h2 className="font-display text-xl">Formal acceptance</h2>
            <p className="text-sm text-[var(--color-pib-text-muted)]">
              By signing below, you confirm that you have read and accept the document in full.
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-[var(--color-pib-accent)]"
              />
              <span className="text-sm">I have read and agree to the terms above</span>
            </label>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-pib-text-muted)]">Type your full name to confirm</label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[var(--color-pib-accent)]"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="flex-1 rounded-md border border-white/10 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFormalAccept}
                disabled={!agreed || !typedName.trim() || approving}
                className="flex-1 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-pib-accent)', color: '#000' }}
              >
                {approving ? 'Submitting…' : 'Accept document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
