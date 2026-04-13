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
    return <div className="pib-skeleton p-12 h-64" />
  }

  if (enquiries.length === 0) {
    return (
      <div className="pib-card text-center">
        <p className="text-[var(--color-on-surface-variant)]">No projects yet — submit an enquiry to start a conversation.</p>
      </div>
    )
  }

  const selected = enquiries.find((e) => e.id === selectedId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Messages</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">Your conversation with the PiB team.</p>
      </div>

      {enquiries.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {enquiries.map((enq) => (
            <button
              key={enq.id}
              onClick={() => setSelectedId(enq.id)}
              className={`text-xs font-label uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                selectedId === enq.id ? 'border-[var(--color-accent-v2)] text-[var(--color-accent-v2)]' : 'border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] hover:border-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              {enq.projectType ?? 'Project'}
            </button>
          ))}
        </div>
      )}

      <div className="pib-card flex flex-col" style={{ height: '480px' }}>
        {/* Thread label */}
        {selected && (
          <div className="px-4 py-3 border-b border-[var(--color-outline-variant)] shrink-0">
            <p className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)]">
              {selected.projectType ?? 'Project'}
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-[var(--color-on-surface-variant)] text-sm text-center pt-8">No messages yet. Start the conversation below.</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.direction === 'inbound' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-xs md:max-w-sm px-4 py-2.5 text-sm ${
                  msg.direction === 'inbound'
                    ? 'bg-[var(--color-accent-v2)] text-black'
                    : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface)] border border-[var(--color-outline-variant)]'
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                {msg.direction === 'inbound' ? 'You' : 'PiB'} · {formatTime(msg.createdAt)}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="border-t border-[var(--color-outline-variant)] p-3 flex gap-2 shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 bg-transparent text-sm text-[var(--color-on-surface)] placeholder-[var(--color-on-surface-variant)] border-0 outline-none font-body"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] disabled:opacity-30 transition-colors px-2"
          >
            {sending ? '...' : 'Send'}
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
