'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Role = 'user' | 'assistant' | 'system' | 'tool'

type ChatEvent = {
  event?: string
  tool?: string
  preview?: string
  timestamp?: number
}

type ChatMessage = {
  id: string
  role: Role
  content: string
  status?: 'pending' | 'streaming' | 'completed' | 'failed'
  runId?: string
  error?: string
  events?: ChatEvent[]
  createdAt?: { seconds?: number; _seconds?: number } | string
}

type Conversation = {
  id: string
  orgId: string
  profile: string
  title: string
  lastMessagePreview?: string
  lastMessageAt?: { seconds?: number; _seconds?: number } | string
  archived?: boolean
}

type Props = {
  orgId: string
  profileEnabled: boolean
}

const POLL_INTERVAL = 1500

function timestampSeconds(ts: ChatMessage['createdAt']) {
  if (!ts) return 0
  if (typeof ts === 'string') return Date.parse(ts) / 1000
  return ts.seconds ?? ts._seconds ?? 0
}

export default function HermesChat({ orgId, profileEnabled }: Props) {
  const apiBase = `/api/v1/admin/hermes/profiles/${orgId}/conversations`

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [liveEvents, setLiveEvents] = useState<Record<string, ChatEvent[]>>({})

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  )

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(apiBase)
      if (!res.ok) throw new Error(`load conversations: ${res.status}`)
      const body = await res.json()
      const list: Conversation[] = body.data?.conversations ?? []
      setConversations(list)
      if (!activeId && list.length) setActiveId(list[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations')
    }
  }, [apiBase, activeId])

  const loadMessages = useCallback(
    async (convId: string) => {
      setLoading(true)
      try {
        const res = await fetch(`${apiBase}/${convId}/messages`)
        if (!res.ok) throw new Error(`load messages: ${res.status}`)
        const body = await res.json()
        setMessages(body.data?.messages ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load messages')
      } finally {
        setLoading(false)
      }
    },
    [apiBase],
  )

  useEffect(() => {
    if (profileEnabled) loadConversations()
  }, [profileEnabled, loadConversations])

  useEffect(() => {
    if (activeId) loadMessages(activeId)
  }, [activeId, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const newConversation = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(apiBase, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) throw new Error(`new conversation: ${res.status}`)
      const body = await res.json()
      const conv: Conversation = body.data?.conversation
      setConversations((prev) => [conv, ...prev])
      setActiveId(conv.id)
      setMessages([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create conversation')
    }
  }, [apiBase])

  const subscribeEvents = useCallback(
    (orgIdInner: string, msgId: string, runId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      const es = new EventSource(`/api/v1/admin/hermes/profiles/${orgIdInner}/runs/${encodeURIComponent(runId)}/events`)
      eventSourceRef.current = es
      es.onmessage = (e) => {
        try {
          const ev: ChatEvent = JSON.parse(e.data)
          setLiveEvents((prev) => ({ ...prev, [msgId]: [...(prev[msgId] || []), ev] }))
        } catch {}
      }
      es.onerror = () => {
        es.close()
        if (eventSourceRef.current === es) eventSourceRef.current = null
      }
    },
    [],
  )

  const pollFinalize = useCallback(
    async (convId: string, msgId: string, runId: string, attempts = 0) => {
      if (attempts > 120) {
        setError('Run timed out waiting for completion')
        return
      }
      try {
        const res = await fetch(`${apiBase}/${convId}/messages/${msgId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId }),
        })
        const body = await res.json()
        if (body.data?.pending) {
          pollRef.current = setTimeout(() => pollFinalize(convId, msgId, runId, attempts + 1), POLL_INTERVAL)
          return
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        await loadMessages(convId)
        await loadConversations()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Finalize failed')
      }
    },
    [apiBase, loadMessages, loadConversations],
  )

  const send = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!input.trim() || sending || !profileEnabled) return
      setError(null)
      setSending(true)
      let convId = activeId
      try {
        if (!convId) {
          const r = await fetch(apiBase, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.slice(0, 80) }) })
          const b = await r.json()
          convId = b.data?.conversation?.id
          if (!convId) throw new Error('Failed to create conversation')
          setConversations((prev) => [b.data.conversation, ...prev])
          setActiveId(convId)
        }
        const content = input
        setInput('')
        const optimisticUser: ChatMessage = { id: `tmp-user-${Date.now()}`, role: 'user', content, status: 'completed' }
        const optimisticAssistant: ChatMessage = { id: `tmp-assistant-${Date.now()}`, role: 'assistant', content: '', status: 'pending' }
        setMessages((prev) => [...prev, optimisticUser, optimisticAssistant])
        const res = await fetch(`${apiBase}/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Send failed')
        const newAssistantId = body.data?.assistantMessage?.id
        const runId = body.data?.runId
        await loadMessages(convId)
        if (newAssistantId && runId) {
          subscribeEvents(orgId, newAssistantId, runId)
          pollFinalize(convId, newAssistantId, runId)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Send failed')
      } finally {
        setSending(false)
      }
    },
    [activeId, apiBase, input, sending, profileEnabled, loadMessages, pollFinalize],
  )

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    if (eventSourceRef.current) eventSourceRef.current.close()
  }, [])

  if (!profileEnabled) {
    return (
      <div className="pib-card text-sm text-on-surface-variant">
        Save and enable a Hermes profile link above to start chatting.
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr] min-h-[600px]">
      <aside className="pib-card flex flex-col gap-2 p-3">
        <button onClick={newConversation} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90">
          + New chat
        </button>
        <div className="text-xs text-on-surface-variant mt-2 px-1">Conversations</div>
        <div className="flex flex-col gap-1 overflow-y-auto max-h-[520px]">
          {conversations.length === 0 && (
            <div className="text-xs text-on-surface-variant px-2 py-3">No chats yet. Start one.</div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                c.id === activeId
                  ? 'bg-[var(--color-card-active,rgba(255,255,255,0.08))] text-on-surface'
                  : 'text-on-surface-variant hover:bg-[var(--color-card-hover,rgba(255,255,255,0.04))]'
              }`}
            >
              <div className="line-clamp-1">{c.title || 'Untitled'}</div>
              {c.lastMessagePreview && (
                <div className="line-clamp-1 text-xs text-on-surface-variant mt-0.5">{c.lastMessagePreview}</div>
              )}
            </button>
          ))}
        </div>
      </aside>

      <section className="pib-card flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-card-border)] px-4 py-2 text-sm">
          <div className="text-on-surface font-medium">{activeConversation?.title || 'New chat'}</div>
          <div className="text-xs text-on-surface-variant">Hermes</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px]">
          {loading && <div className="text-xs text-on-surface-variant">Loading…</div>}
          {!loading && messages.length === 0 && (
            <div className="text-sm text-on-surface-variant py-8 text-center">
              Send a task or question. Your agent has access to skills, files, terminal (per capability switches).
            </div>
          )}
          {messages.sort((a, b) => timestampSeconds(a.createdAt) - timestampSeconds(b.createdAt)).map((m) => {
            const events = liveEvents[m.id] ?? []
            return (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${m.role === 'user' ? '' : 'w-full'}`}>
                  {m.role === 'assistant' && events.length > 0 && m.status !== 'completed' && (
                    <div className="mb-1 space-y-1 text-xs text-on-surface-variant">
                      {events.slice(-5).map((ev, i) => (
                        <div key={i} className="flex items-baseline gap-2 rounded-md bg-[var(--color-card,rgba(255,255,255,0.03))] px-2 py-1">
                          <span className="font-mono opacity-70">{ev.event ?? 'event'}</span>
                          {ev.tool && <span className="text-primary">{ev.tool}</span>}
                          {ev.preview && <span className="truncate opacity-80">{ev.preview}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-primary text-on-primary'
                        : m.status === 'failed'
                        ? 'bg-red-500/15 text-red-200 border border-red-500/40'
                        : 'bg-[var(--color-card-active,rgba(255,255,255,0.06))] text-on-surface'
                    }`}
                  >
                    {m.status === 'pending' && !m.content && <span className="opacity-70 italic">Thinking…</span>}
                    {m.content || (m.status === 'failed' && m.error)}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
        {error && <div className="px-4 py-2 text-xs text-red-300 border-t border-red-500/30 bg-red-500/10">{error}</div>}
        <form onSubmit={send} className="flex gap-2 border-t border-[var(--color-card-border)] p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(e as unknown as FormEvent)
              }
            }}
            placeholder="Send a message — Enter to send, Shift+Enter for new line"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-50 hover:opacity-90"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </section>
    </div>
  )
}
