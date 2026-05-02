'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface Message {
  id: string
  text: string
  direction: 'inbound' | 'outbound'
  authorName: string
  createdAt?: { _seconds?: number; seconds?: number }
}

interface Enquiry {
  id: string
  projectType: string
  status: string
}

function formatTime(ts?: { _seconds?: number; seconds?: number }) {
  if (!ts) return ''
  const secs = ts._seconds ?? ts.seconds ?? 0
  return new Date(secs * 1000).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function MessagesContent() {
  const searchParams = useSearchParams()
  const preselectedId = searchParams.get('enquiryId')

  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/v1/portal/enquiries')
      .then((r) => r.json())
      .then((b) => {
        const list: Enquiry[] = b.data ?? []
        setEnquiries(list)
        if (!selectedId && list.length > 0) setSelectedId(list[0].id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) return
    fetch(`/api/v1/portal/messages?enquiryId=${selectedId}`)
      .then((r) => r.json())
      .then((b) => {
        setMessages(b.data ?? [])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
  }, [selectedId])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !selectedId || sending) return
    setSending(true)
    const res = await fetch('/api/v1/portal/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId: selectedId, text: text.trim() }),
    })
    if (res.ok) {
      const body = await res.json()
      setMessages((prev) => [
        ...prev,
        { id: body.data?.id ?? Date.now().toString(), text: text.trim(), direction: 'inbound', authorName: 'You' },
      ])
      setText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="pib-skeleton h-12 w-48" />
        <div className="pib-skeleton h-96" />
      </div>
    )
  }

  if (enquiries.length === 0) {
    return (
      <div className="space-y-10">
        <header>
          <p className="eyebrow">Direct line to your team</p>
          <h1 className="pib-page-title mt-2">Messages</h1>
        </header>
        <div className="bento-card p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">forum</span>
          <p className="text-[var(--color-pib-text-muted)] mt-4">
            No projects yet — submit an enquiry to start a conversation.
          </p>
        </div>
      </div>
    )
  }

  const selected = enquiries.find((e) => e.id === selectedId)

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Direct line to your team</p>
        <h1 className="pib-page-title mt-2">Messages</h1>
        <p className="pib-page-sub">Async by default. Replies typically within one business day.</p>
      </header>

      {enquiries.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {enquiries.map((enq) => (
            <button
              key={enq.id}
              onClick={() => setSelectedId(enq.id)}
              className={[
                'pill transition-colors',
                selectedId === enq.id ? 'pill-accent' : 'hover:!text-[var(--color-pib-text)]',
              ].join(' ')}
            >
              {enq.projectType ?? 'Project'}
            </button>
          ))}
        </div>
      )}

      <div className="bento-card !p-0 flex flex-col overflow-hidden" style={{ height: '560px' }}>
        {selected && (
          <div className="px-5 py-3.5 border-b border-[var(--color-pib-line)] shrink-0 flex items-center justify-between">
            <div>
              <p className="eyebrow !text-[10px]">{selected.projectType ?? 'Project'}</p>
              <p className="text-xs text-[var(--color-pib-text-muted)] mt-0.5 font-mono">{selected.status}</p>
            </div>
            <span className="pill !text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-pib-success)]" />
              live
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
          {messages.length === 0 && (
            <p className="text-[var(--color-pib-text-muted)] text-sm text-center py-12">
              No messages yet. Start the conversation below.
            </p>
          )}
          {messages.map((msg) => {
            const mine = msg.direction === 'inbound'
            return (
              <div key={msg.id} className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  className={[
                    'max-w-[78%] px-4 py-2.5 text-sm rounded-2xl leading-snug',
                    mine
                      ? 'bg-[var(--color-pib-accent)] text-black rounded-br-md'
                      : 'bg-[var(--color-pib-surface-2)] border border-[var(--color-pib-line)] text-[var(--color-pib-text)] rounded-bl-md',
                  ].join(' ')}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-[var(--color-pib-text-muted)] font-mono px-1">
                  {mine ? 'You' : 'PiB'} · {formatTime(msg.createdAt)}
                </span>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-[var(--color-pib-line)] p-3 flex gap-2 shrink-0 bg-[var(--color-pib-bg)]/60"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="pib-input flex-1 !rounded-full !py-2.5"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="pib-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? '…' : 'Send'}
            <span className="material-symbols-outlined text-base">send</span>
          </button>
        </form>
      </div>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesContent />
    </Suspense>
  )
}
