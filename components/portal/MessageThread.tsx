'use client'

import { useState } from 'react'

interface Message {
  id: string
  text: string
  direction: 'inbound' | 'outbound'
  authorName: string
  createdAt: any
}

interface Props {
  messages: Message[]
  enquiryId: string
  onSent: (msg: Message) => void
}

export default function MessageThread({ messages, enquiryId, onSent }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (!text.trim()) return
    setSending(true)
    const res = await fetch('/api/v1/portal/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId, text: text.trim() }),
    })
    if (res.ok) {
      const body = await res.json()
      onSent({ id: body.data.id, text: text.trim(), direction: 'inbound', authorName: 'You', createdAt: null })
      setText('')
    }
    setSending(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-white/40 text-sm text-center py-6">No messages yet. Send us an update below.</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                msg.direction === 'inbound'
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.03] border border-white/10 text-white/80'
              }`}
            >
              <p className="text-xs font-medium mb-1 opacity-60">{msg.authorName}</p>
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Send a message or update…"
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder:text-white/30 outline-none focus:border-white/30"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40 transition-opacity"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
