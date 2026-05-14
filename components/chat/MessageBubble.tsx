'use client'

import { useEffect, useState } from 'react'
import type { ChatEvent } from '@/lib/hermes/types'

// Matches Phase 1 ConversationMessage shape
export interface ConversationMessage {
  id: string
  conversationId: string
  role: string
  content: string
  runId?: string
  status?: string
  error?: string
  events?: unknown[]
  toolName?: string
  authorKind: 'user' | 'agent' | 'system'
  authorId: string
  authorDisplayName: string
  createdAt?: { seconds?: number; _seconds?: number } | string
}

// colorKey → tailwind background + text classes
const AGENT_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  violet:  { bg: 'bg-violet-600/20',  text: 'text-violet-300',  dot: 'bg-violet-400' },
  sky:     { bg: 'bg-sky-600/20',     text: 'text-sky-300',     dot: 'bg-sky-400' },
  amber:   { bg: 'bg-amber-600/20',   text: 'text-amber-300',   dot: 'bg-amber-400' },
  emerald: { bg: 'bg-emerald-600/20', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  rose:    { bg: 'bg-rose-600/20',    text: 'text-rose-300',    dot: 'bg-rose-400' },
}

const DEFAULT_COLOR = { bg: 'bg-white/10', text: 'text-white', dot: 'bg-white/40' }

interface MessageBubbleProps {
  message: ConversationMessage
  currentUserUid: string
  agentColorKey?: string
  agentIconKey?: string
  liveEvents?: ChatEvent[]
}

function initials(name: string): string {
  return name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
}

function useElapsed(active: boolean): number {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!active) { setSecs(0); return }
    setSecs(0)
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [active])
  return secs
}

export default function MessageBubble({
  message: m,
  currentUserUid,
  agentColorKey,
  agentIconKey,
  liveEvents = [],
}: MessageBubbleProps) {
  const isMine = m.authorId === currentUserUid
  const isTool = m.role === 'tool'
  const isPending = m.status === 'pending' || m.status === 'streaming'
  const isWaiting = m.status === 'waiting_approval'
  const isFailed = m.status === 'failed'
  const elapsed = useElapsed(isPending || isWaiting)

  // Tool pill — no avatar, compact
  if (isTool) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-on-surface-variant font-mono">
          <span className="material-symbols-outlined text-[14px] text-primary">build</span>
          <span>{m.toolName ?? 'tool'}</span>
          {m.content && <span className="opacity-60 truncate max-w-[240px]">{m.content}</span>}
        </div>
      </div>
    )
  }

  const color = agentColorKey ? (AGENT_COLOR[agentColorKey] ?? DEFAULT_COLOR) : DEFAULT_COLOR
  const displayEvents: ChatEvent[] = liveEvents.length
    ? liveEvents
    : ((m.events ?? []) as ChatEvent[])

  // User's own message — float right, no avatar
  if (isMine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap bg-primary text-on-primary">
            {m.content}
          </div>
        </div>
      </div>
    )
  }

  // Other (agent or another user) — float left with avatar
  const isAgent = m.authorKind === 'agent'

  return (
    <div className="flex justify-start gap-2.5 w-full">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {isAgent ? (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color.bg}`}>
            <span className={`material-symbols-outlined text-[16px] ${color.text}`}>
              {agentIconKey ?? 'smart_toy'}
            </span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-xs font-bold text-on-surface">
            {initials(m.authorDisplayName)}
          </div>
        )}
      </div>

      {/* Bubble content */}
      <div className="max-w-[78%] flex-1 min-w-0">
        {/* Author label */}
        <p className={`text-[10px] font-medium mb-1 ${isAgent ? color.text : 'text-on-surface-variant'}`}>
          {m.authorDisplayName}
        </p>

        {/* Live events (while pending/streaming/waiting) */}
        {(isPending || isWaiting) && (
          <div className="mb-1 space-y-1">
            {/* Elapsed timer */}
            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/60 px-1">
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce [animation-delay:0ms]">·</span>
                <span className="animate-bounce [animation-delay:150ms]">·</span>
                <span className="animate-bounce [animation-delay:300ms]">·</span>
              </span>
              {elapsed > 0 && <span>{elapsed}s</span>}
              {elapsed > 60 && <span className="text-amber-400/70">still working…</span>}
            </div>
            {displayEvents.slice(-6).map((ev, i) => (
              <div
                key={i}
                className="flex items-baseline gap-2 rounded-md bg-[var(--color-card,rgba(255,255,255,0.03))] px-2 py-1 text-xs text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[12px] text-primary/70 shrink-0">build</span>
                {ev.tool && <span className="text-primary font-mono shrink-0">{ev.tool}</span>}
                <span className="font-mono opacity-50 shrink-0">{ev.event ?? 'event'}</span>
                {ev.preview && <span className="truncate opacity-70">{ev.preview}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Completed tool-call timeline (collapsible) */}
        {displayEvents.length > 0 && !isPending && !isWaiting && (
          <details className="mb-2 text-xs text-on-surface-variant group/details">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[var(--color-card,rgba(255,255,255,0.03))]">
              <span className="group-open/details:hidden">▶</span>
              <span className="hidden group-open/details:inline">▼</span>
              <span>
                {displayEvents.length} tool call{displayEvents.length !== 1 ? 's' : ''}
              </span>
            </summary>
            <div className="mt-1 space-y-0.5 pl-3 border-l border-[var(--color-card-border)]">
              {displayEvents.map((ev, i) => {
                const ts = ev.timestamp
                  ? new Date(ev.timestamp * 1000).toISOString().slice(11, 19)
                  : null
                const toolLabel = ev.tool || ev.event
                return (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    {ts && <span className="font-mono opacity-40 shrink-0">{ts}</span>}
                    {toolLabel && (
                      <span className="text-primary font-mono shrink-0">{toolLabel}</span>
                    )}
                    {ev.preview && <span className="truncate opacity-70">{ev.preview}</span>}
                  </div>
                )
              })}
            </div>
          </details>
        )}

        {/* The bubble itself */}
        <div
          className={`rounded-2xl rounded-tl-md px-4 py-2.5 text-sm whitespace-pre-wrap ${
            isFailed
              ? 'bg-red-500/15 text-red-200 border border-red-500/40'
              : 'bg-[var(--color-card-active,rgba(255,255,255,0.06))] text-on-surface'
          }`}
        >
          {isPending && !m.content && (
            <span className="opacity-40 italic text-xs">Thinking…</span>
          )}
          {isWaiting && !m.content && (
            <span className="opacity-70 italic">Paused — awaiting tool approval…</span>
          )}
          {m.content || (isFailed && m.error) || null}
        </div>
      </div>
    </div>
  )
}
