# Chat UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent tool-call cards, inline approval flow, and ⋯ rename/archive to the Hermes chat UI.

**Architecture:** Three independent features all centred on `components/hermes/Chat.tsx`, with backend support in `lib/hermes/types.ts`, `lib/hermes/conversations.ts`, and the finalize API route. `ChatEvent` is extracted to the shared types file so both the lib and client component can reference it. No new files are created.

**Tech Stack:** Next.js 15 App Router, React 18, Tailwind CSS, Firebase Firestore (Admin SDK), Jest (API route tests only — no jsdom component tests in this project).

---

## File Map

| File | Change |
|---|---|
| `lib/hermes/types.ts` | Export `ChatEvent` type |
| `lib/hermes/conversations.ts` | Import `ChatEvent`; add `events?: ChatEvent[]` to `HermesMessage` |
| `app/api/v1/admin/hermes/profiles/[orgId]/conversations/[convId]/messages/[msgId]/finalize/route.ts` | Accept `events` from body; detect `waiting_for_approval` |
| `__tests__/api/hermes-finalize.test.ts` | New — covers events persistence + approval detection |
| `components/hermes/Chat.tsx` | Types, state, send/poll logic, all three JSX features |

---

## Task 1 — Export `ChatEvent` from shared types

**Files:**
- Modify: `lib/hermes/types.ts`

- [ ] **Step 1: Add `ChatEvent` export at the bottom of types.ts**

  Open `lib/hermes/types.ts`. Append after the last export:

  ```ts
  export type ChatEvent = {
    event?: string
    tool?: string
    preview?: string
    timestamp?: number
  }
  ```

- [ ] **Step 2: Verify TypeScript is happy**

  ```bash
  cd "partnersinbiz-web"
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no new errors.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/hermes/types.ts
  git commit -m "feat(hermes): export ChatEvent type from shared types"
  ```

---

## Task 2 — Add `events` field to `HermesMessage`

**Files:**
- Modify: `lib/hermes/conversations.ts`

- [ ] **Step 1: Add import and field**

  In `lib/hermes/conversations.ts`, add the `ChatEvent` import at the top with the other firebase-admin imports:

  ```ts
  import type { ChatEvent } from './types'
  ```

  Then in the `HermesMessage` interface, add after the `error` field:

  ```ts
  events?: ChatEvent[]
  ```

  The full updated interface:

  ```ts
  export interface HermesMessage {
    id: string
    conversationId: string
    role: HermesMessageRole
    content: string
    runId?: string
    status?: 'pending' | 'streaming' | 'completed' | 'failed'
    error?: string
    events?: ChatEvent[]
    toolName?: string
    createdAt?: Timestamp | FieldValue
    createdBy?: string
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no new errors.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/hermes/conversations.ts
  git commit -m "feat(hermes): add events field to HermesMessage"
  ```

---

## Task 3 — Update finalize route: events + approval detection

**Files:**
- Modify: `app/api/v1/admin/hermes/profiles/[orgId]/conversations/[convId]/messages/[msgId]/finalize/route.ts`
- Create: `__tests__/api/hermes-finalize.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `__tests__/api/hermes-finalize.test.ts`:

  ```ts
  import { NextRequest } from 'next/server'
  import type { ChatEvent } from '@/lib/hermes/types'

  type MockUser = { uid: string; role: 'admin' | 'client' | 'ai'; orgId?: string }
  type MockHandler = (req: NextRequest, user: MockUser, ctx?: unknown) => Promise<Response>

  const mockCallHermesJson = jest.fn()
  const mockRequireAccess = jest.fn()
  const mockGetConversation = jest.fn()
  const mockMessagesDoc = jest.fn()
  const mockUpdateMessage = jest.fn()
  const mockTouchConversation = jest.fn()

  let mockUser: MockUser = { uid: 'u1', role: 'admin' }

  jest.mock('@/lib/api/auth', () => ({
    withAuth: (_role: string, handler: MockHandler) =>
      async (req: NextRequest, ctx?: unknown) => handler(req, mockUser, ctx),
  }))

  jest.mock('@/lib/hermes/server', () => ({
    requireHermesProfileAccess: (...args: unknown[]) => mockRequireAccess(...args),
    callHermesJson: (...args: unknown[]) => mockCallHermesJson(...args),
  }))

  jest.mock('@/lib/hermes/conversations', () => ({
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
    messagesCollection: () => ({ doc: () => ({ get: mockMessagesDoc }) }),
    updateMessage: (...args: unknown[]) => mockUpdateMessage(...args),
    touchConversation: (...args: unknown[]) => mockTouchConversation(...args),
  }))

  jest.mock('@/lib/api/response', () => ({
    apiError: (msg: string, status = 400) =>
      new Response(JSON.stringify({ error: msg }), { status }),
    apiSuccess: (data: unknown) =>
      new Response(JSON.stringify({ data }), { status: 200 }),
  }))

  const baseLink = { orgId: 'org1', profile: 'p1', baseUrl: 'http://vps', enabled: true }
  const baseConv = { id: 'conv1', orgId: 'org1', participantUids: ['u1'] }

  function makeRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/v1/admin/hermes/profiles/org1/conversations/conv1/messages/msg1/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    mockUser = { uid: 'u1', role: 'admin' }
    mockRequireAccess.mockResolvedValue({ link: baseLink })
    mockGetConversation.mockResolvedValue(baseConv)
    mockMessagesDoc.mockResolvedValue({ exists: true, data: () => ({}) })
    mockUpdateMessage.mockResolvedValue(undefined)
    mockTouchConversation.mockResolvedValue(undefined)
  })

  describe('finalize route', () => {
    it('saves events to message when run completes', async () => {
      const events: ChatEvent[] = [
        { event: 'tool.call', tool: 'list_tasks', preview: '12 results', timestamp: 1000 },
      ]
      mockCallHermesJson.mockResolvedValue({
        response: { ok: true },
        data: { status: 'completed', output: 'Done!' },
      })

      const { POST } = await import(
        '@/app/api/v1/admin/hermes/profiles/[orgId]/conversations/[convId]/messages/[msgId]/finalize/route'
      )
      const res = await POST(
        makeRequest({ runId: 'run-1', events }),
        { params: Promise.resolve({ orgId: 'org1', convId: 'conv1', msgId: 'msg1' }) },
      )
      const body = await res.json()

      expect(body.data.status).toBe('completed')
      expect(mockUpdateMessage).toHaveBeenCalledWith(
        'conv1', 'msg1',
        expect.objectContaining({ events, status: 'completed' }),
      )
    })

    it('returns waitingForApproval when Hermes status is waiting_for_approval', async () => {
      mockCallHermesJson.mockResolvedValue({
        response: { ok: true },
        data: { status: 'waiting_for_approval' },
      })

      const { POST } = await import(
        '@/app/api/v1/admin/hermes/profiles/[orgId]/conversations/[convId]/messages/[msgId]/finalize/route'
      )
      const res = await POST(
        makeRequest({ runId: 'run-1' }),
        { params: Promise.resolve({ orgId: 'org1', convId: 'conv1', msgId: 'msg1' }) },
      )
      const body = await res.json()

      expect(body.data.pending).toBe(false)
      expect(body.data.waitingForApproval).toBe(true)
      expect(mockUpdateMessage).not.toHaveBeenCalled()
    })

    it('returns pending:true for other in-progress statuses', async () => {
      mockCallHermesJson.mockResolvedValue({
        response: { ok: true },
        data: { status: 'running' },
      })

      const { POST } = await import(
        '@/app/api/v1/admin/hermes/profiles/[orgId]/conversations/[convId]/messages/[msgId]/finalize/route'
      )
      const res = await POST(
        makeRequest({ runId: 'run-1' }),
        { params: Promise.resolve({ orgId: 'org1', convId: 'conv1', msgId: 'msg1' }) },
      )
      const body = await res.json()

      expect(body.data.pending).toBe(true)
      expect(mockUpdateMessage).not.toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npx jest __tests__/api/hermes-finalize.test.ts --no-coverage 2>&1 | tail -20
  ```

  Expected: FAIL — `waitingForApproval` assertion fails, and `events` not passed to `updateMessage`.

- [ ] **Step 3: Update the finalize route**

  Replace the full content of `app/api/v1/admin/hermes/profiles/[orgId]/conversations/[convId]/messages/[msgId]/finalize/route.ts` with:

  ```ts
  import { NextRequest } from 'next/server'
  import { withAuth } from '@/lib/api/auth'
  import { apiError, apiSuccess } from '@/lib/api/response'
  import { callHermesJson, requireHermesProfileAccess } from '@/lib/hermes/server'
  import { getConversation, messagesCollection, touchConversation, updateMessage } from '@/lib/hermes/conversations'
  import type { ChatEvent } from '@/lib/hermes/types'

  export const dynamic = 'force-dynamic'

  type Ctx = { params: Promise<{ orgId: string; convId: string; msgId: string }> }

  export const POST = withAuth('client', async (req: NextRequest, user, ctx) => {
    const { orgId, convId, msgId } = await (ctx as Ctx).params
    const access = await requireHermesProfileAccess(user, orgId, 'runs')
    if (access instanceof Response) return access
    const conv = await getConversation(convId)
    if (!conv || conv.orgId !== orgId) return apiError('Conversation not found', 404)
    if (!conv.participantUids.includes(user.uid)) return apiError('Forbidden', 403)

    const msgDoc = await messagesCollection(convId).doc(msgId).get()
    if (!msgDoc.exists) return apiError('Message not found', 404)

    const body = await req.json().catch(() => ({}))
    const runId = typeof body.runId === 'string' ? body.runId : ''
    if (!runId) return apiError('runId is required', 400)

    const events: ChatEvent[] = Array.isArray(body.events) ? body.events : []

    const { response, data } = await callHermesJson(access.link, `/v1/runs/${encodeURIComponent(runId)}`)
    if (!response.ok) {
      return apiError('Failed to fetch Hermes run', response.status || 502, { hermes: data })
    }

    const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const status = String(payload.status ?? 'unknown')
    const output = typeof payload.output === 'string' ? payload.output : ''
    const error = typeof payload.error === 'string' ? payload.error : undefined

    if (status === 'completed') {
      await updateMessage(convId, msgId, {
        content: output,
        status: 'completed',
        runId,
        ...(events.length > 0 ? { events } : {}),
      })
      await touchConversation(convId, {
        lastMessagePreview: output,
        lastMessageRole: 'assistant',
      })
    } else if (status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'stopped') {
      await updateMessage(convId, msgId, {
        content: error || `Run ${status}`,
        status: 'failed',
        error,
        runId,
      })
      await touchConversation(convId, {
        lastMessagePreview: `[run ${status}] ${error || ''}`.slice(0, 200),
        lastMessageRole: 'assistant',
      })
    } else if (status === 'waiting_for_approval' || status === 'approval_required') {
      return apiSuccess({ status, pending: false, waitingForApproval: true })
    } else {
      return apiSuccess({ status, pending: true })
    }

    return apiSuccess({ status, output, error })
  })
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npx jest __tests__/api/hermes-finalize.test.ts --no-coverage 2>&1 | tail -20
  ```

  Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/v1/admin/hermes/profiles/\[orgId\]/conversations/\[convId\]/messages/\[msgId\]/finalize/route.ts __tests__/api/hermes-finalize.test.ts
  git commit -m "feat(hermes): finalize route saves events + detects waiting_for_approval"
  ```

---

## Task 4 — Chat.tsx: types, state, utility callbacks

**Files:**
- Modify: `components/hermes/Chat.tsx`

This task adds all new type definitions, state variables, and the three new callback functions. No JSX changes yet.

- [ ] **Step 1: Replace the top of the file (imports + types)**

  Replace lines 1–34 (the `'use client'` directive through the end of the `Props` type) with:

  ```tsx
  'use client'

  import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
  import type { ChatEvent } from '@/lib/hermes/types'

  type Role = 'user' | 'assistant' | 'system' | 'tool'

  type ChatMessage = {
    id: string
    role: Role
    content: string
    status?: 'pending' | 'streaming' | 'completed' | 'failed' | 'waiting_approval'
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
    projectId?: string
    projectName?: string
  }
  ```

- [ ] **Step 2: Add new state variables inside the component**

  After the existing state declarations (after the `const [liveEvents, ...]` line, around line 64), add:

  ```tsx
  const [approvalPending, setApprovalPending] = useState<Record<string, { runId: string; toolName?: string }>>({})
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  ```

- [ ] **Step 3: Add outside-click effect to close the ⋯ dropdown**

  After the existing `useEffect` that scrolls to the bottom (the one with `messagesEndRef`), add:

  ```tsx
  useEffect(() => {
    if (!menuOpenId) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-conv-menu]')) setMenuOpenId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])
  ```

- [ ] **Step 4: Add `resolveApproval` callback**

  Add after the existing `pollFinalize` callback:

  ```tsx
  const resolveApproval = useCallback(
    async (msgId: string, choice: 'once' | 'always' | 'deny') => {
      const pending = approvalPending[msgId]
      if (!pending) return
      try {
        const res = await fetch(
          `/api/v1/admin/hermes/profiles/${orgId}/runs/${encodeURIComponent(pending.runId)}/approval`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }) },
        )
        if (!res.ok) throw new Error(`approval failed: ${res.status}`)
        setApprovalPending((prev) => { const next = { ...prev }; delete next[msgId]; return next })
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'pending' } : m)),
        )
        if (activeId) pollFinalize(activeId, msgId, pending.runId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Approval failed')
      }
    },
    [approvalPending, orgId, activeId, pollFinalize],
  )
  ```

- [ ] **Step 5: Add `renameConversation` callback**

  Add after `resolveApproval`:

  ```tsx
  const renameConversation = useCallback(
    async (convId: string, title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      setRenamingId(null)
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: trimmed } : c)),
      )
      await fetch(`/api/v1/admin/hermes/profiles/${orgId}/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      }).catch(() => {/* optimistic — ignore errors silently */})
    },
    [orgId],
  )
  ```

- [ ] **Step 6: Add `archiveConversation` callback**

  Add after `renameConversation`:

  ```tsx
  const archiveConversation = useCallback(
    async (convId: string) => {
      setMenuOpenId(null)
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (activeId === convId) setActiveId(null)
      await fetch(`/api/v1/admin/hermes/profiles/${orgId}/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      }).catch(() => {/* optimistic */})
    },
    [orgId, activeId],
  )
  ```

- [ ] **Step 7: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: errors about `approvalPending`/`resolveApproval` being unused — that's fine, they'll be wired in the next tasks.

- [ ] **Step 8: Commit**

  ```bash
  git add components/hermes/Chat.tsx
  git commit -m "feat(hermes): chat state + callbacks for approval, rename, archive"
  ```

---

## Task 5 — Chat.tsx: wire approval detection into `pollFinalize` and `send`

**Files:**
- Modify: `components/hermes/Chat.tsx`

- [ ] **Step 1: Update `pollFinalize` to detect `waitingForApproval`**

  Find the `pollFinalize` callback. Replace the block that handles `body.data?.pending`:

  ```tsx
  // BEFORE — the inner try block currently looks like:
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
  ```

  Replace with:

  ```tsx
  const events = liveEvents[msgId] ?? []
  const res = await fetch(`${apiBase}/${convId}/messages/${msgId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId, events }),
  })
  const body = await res.json()
  if (body.data?.pending) {
    pollRef.current = setTimeout(() => pollFinalize(convId, msgId, runId, attempts + 1), POLL_INTERVAL)
    return
  }
  if (body.data?.waitingForApproval) {
    const lastEvent = events[events.length - 1]
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, status: 'waiting_approval', runId } : m)),
    )
    setApprovalPending((prev) => ({
      ...prev,
      [msgId]: { runId, toolName: lastEvent?.tool },
    }))
    return
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no new errors.

- [ ] **Step 3: Commit**

  ```bash
  git add components/hermes/Chat.tsx
  git commit -m "feat(hermes): pass events to finalize + detect waiting_for_approval in poll"
  ```

---

## Task 6 — Chat.tsx: tool-call cards JSX

**Files:**
- Modify: `components/hermes/Chat.tsx`

- [ ] **Step 1: Replace the live-events block in the message render**

  Find this block inside the `messages.sort(...).map((m) => { ... })` loop:

  ```tsx
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
  ```

  Replace with:

  ```tsx
  {m.role === 'assistant' && (() => {
    const displayEvents = liveEvents[m.id]?.length ? liveEvents[m.id] : (m.events ?? [])
    if (!displayEvents.length) return null
    const isLive = m.status === 'pending' || m.status === 'streaming' || m.status === 'waiting_approval'
    if (isLive) {
      // live strip — compact, no toggle
      return (
        <div className="mb-1 space-y-1 text-xs text-on-surface-variant">
          {displayEvents.slice(-5).map((ev, i) => (
            <div key={i} className="flex items-baseline gap-2 rounded-md bg-[var(--color-card,rgba(255,255,255,0.03))] px-2 py-1">
              <span className="font-mono opacity-70">{ev.event ?? 'event'}</span>
              {ev.tool && <span className="text-primary">{ev.tool}</span>}
              {ev.preview && <span className="truncate opacity-80">{ev.preview}</span>}
            </div>
          ))}
        </div>
      )
    }
    // completed — collapsible timeline
    return (
      <details className="mb-2 text-xs text-on-surface-variant group/details">
        <summary className="cursor-pointer select-none list-none flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[var(--color-card,rgba(255,255,255,0.03))]">
          <span className="group-open/details:hidden">▶</span>
          <span className="hidden group-open/details:inline">▼</span>
          <span>{displayEvents.length} tool call{displayEvents.length !== 1 ? 's' : ''}</span>
        </summary>
        <div className="mt-1 space-y-0.5 pl-3 border-l border-[var(--color-card-border)]">
          {displayEvents.map((ev, i) => {
            const ts = ev.timestamp ? new Date(ev.timestamp * 1000).toISOString().slice(11, 19) : null
            return (
              <div key={i} className="flex items-center gap-2 py-0.5">
                {ts && <span className="font-mono opacity-40 shrink-0">{ts}</span>}
                {ev.tool && <span className="text-primary font-mono shrink-0">{ev.tool}</span>}
                {ev.preview && <span className="truncate opacity-70">{ev.preview}</span>}
              </div>
            )
          })}
        </div>
      </details>
    )
  })()}
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 3: Manual check — tool-call cards visible**

  - Start the dev server: `npm run dev`
  - Navigate to an org's Agent tab at `http://localhost:3000/admin/org/[slug]/agent`
  - Send a message that triggers tool use (e.g. "List my projects")
  - While running: compact event strip should show live below the thinking bubble
  - After completion: a collapsible `▶ N tool calls` detail element should appear above the response bubble
  - Click to expand: timestamped timeline rows visible

- [ ] **Step 4: Commit**

  ```bash
  git add components/hermes/Chat.tsx
  git commit -m "feat(hermes): persistent tool-call cards — collapsible timeline after run completes"
  ```

---

## Task 7 — Chat.tsx: inline approval card JSX

**Files:**
- Modify: `components/hermes/Chat.tsx`

- [ ] **Step 1: Add approval card below the message bubble**

  Find the closing `</div>` of the outer message wrapper (the `<div className={`max-w-[80%]...`}>` block). The current structure ends with:

  ```tsx
                  </div>
                </div>
              </div>
  ```

  Add the approval card **inside** the `max-w-[80%]` wrapper, after the existing bubble `<div>`:

  ```tsx
  {m.role === 'assistant' && m.status === 'waiting_approval' && approvalPending[m.id] && (
    <div className="mt-2 rounded-xl border border-[#f59e0b44] bg-[#1a1500] px-4 py-3 text-sm">
      <div className="mb-1 font-medium text-[#f59e0b]">⏸ Waiting for approval</div>
      <div className="mb-3 text-[#d4c4a0]">
        I want to call{' '}
        <span className="font-mono text-[#93c5fd]">
          {approvalPending[m.id]!.toolName ?? 'a tool'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => resolveApproval(m.id, 'once')}
          className="rounded-md bg-[#166534] px-3 py-1.5 text-xs font-medium text-[#86efac] hover:opacity-90"
        >
          Allow once
        </button>
        <button
          onClick={() => resolveApproval(m.id, 'always')}
          className="rounded-md bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-[#93c5fd] hover:opacity-90"
        >
          Allow always
        </button>
        <button
          onClick={() => resolveApproval(m.id, 'deny')}
          className="rounded-md bg-[#3b0000] px-3 py-1.5 text-xs font-medium text-[#fca5a5] hover:opacity-90"
        >
          Deny
        </button>
      </div>
    </div>
  )}
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 3: Manual check — approval card renders**

  The approval flow requires Hermes to actually return `waiting_for_approval`. To verify the card renders correctly without a live approval event, temporarily add this to `newConversation` or a debug button:

  ```tsx
  // temp debug — remove after visual check
  setMessages([{
    id: 'test-approval',
    role: 'assistant',
    content: '',
    status: 'waiting_approval',
    runId: 'fake-run',
  }])
  setApprovalPending({ 'test-approval': { runId: 'fake-run', toolName: 'update_task' } })
  ```

  Verify the amber card renders with correct colours and all three buttons. Remove the debug code.

- [ ] **Step 4: Commit**

  ```bash
  git add components/hermes/Chat.tsx
  git commit -m "feat(hermes): inline approval card for waiting_for_approval runs"
  ```

---

## Task 8 — Chat.tsx: ⋯ rename + archive sidebar

**Files:**
- Modify: `components/hermes/Chat.tsx`

- [ ] **Step 1: Replace the conversations list render**

  Find the `conversations.map((c) => (...))` block in the `<aside>` sidebar. Replace the entire map with:

  ```tsx
  {conversations.filter((c) => !c.archived).map((c) => (
    <div key={c.id} className="relative group/conv">
      {renamingId === c.id ? (
        <div className="flex items-center gap-1 rounded-lg px-2 py-1.5">
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') renameConversation(c.id, renameValue)
              if (e.key === 'Escape') setRenamingId(null)
            }}
            onBlur={() => renameConversation(c.id, renameValue)}
            className="flex-1 min-w-0 bg-transparent border-b border-primary text-sm text-on-surface outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setActiveId(c.id)}
          className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors pr-8 ${
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
      )}

      {/* ⋯ hover button */}
      {renamingId !== c.id && (
        <button
          data-conv-menu
          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id) }}
          className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover/conv:flex items-center justify-center w-6 h-6 rounded text-on-surface-variant hover:text-on-surface hover:bg-[var(--color-card-hover,rgba(255,255,255,0.08))]"
          aria-label="Conversation options"
        >
          ⋯
        </button>
      )}

      {/* dropdown */}
      {menuOpenId === c.id && (
        <div
          data-conv-menu
          className="absolute right-0 top-7 z-20 min-w-[120px] rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface,#1c1c1c)] py-1 shadow-lg"
        >
          <button
            className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-[var(--color-card-hover,rgba(255,255,255,0.06))]"
            onClick={() => {
              setMenuOpenId(null)
              setRenamingId(c.id)
              setRenameValue(c.title || '')
            }}
          >
            ✏️ Rename
          </button>
          <button
            className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[var(--color-card-hover,rgba(255,255,255,0.06))]"
            onClick={() => archiveConversation(c.id)}
          >
            📦 Archive
          </button>
        </div>
      )}
    </div>
  ))}
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 3: Manual check — ⋯ menu works**

  - Hover a conversation in the sidebar → ⋯ button appears
  - Click ⋯ → dropdown shows Rename and Archive
  - Click outside → dropdown closes
  - Click Rename → title becomes an input field; type a new name + Enter → title updates
  - Click ⋯ → Archive → conversation disappears from sidebar

- [ ] **Step 4: Run full test suite to verify no regressions**

  ```bash
  npx jest --no-coverage 2>&1 | tail -10
  ```

  Expected: all existing tests pass + 3 new finalize tests green.

- [ ] **Step 5: Final commit**

  ```bash
  git add components/hermes/Chat.tsx
  git commit -m "feat(hermes): conversation rename + archive via hover menu in sidebar"
  ```

---

## Verification

After all tasks complete:

1. **Tool-call cards:** send a prompt that uses tools → after completion a `▶ N tool calls` toggle appears above the bubble → expand to see timestamped trace → reload the page → toggle still works (events loaded from Firestore).
2. **Approval:** trigger a run that requires approval (or use the temporary debug snippet from Task 7 Step 3) → amber card renders → click Allow once → run resumes → card disappears.
3. **Rename/archive:** hover any conversation → ⋯ appears → rename saves → archive removes → page reload confirms archive persisted (conversation gone).
4. **No regressions:** `npx jest --no-coverage` all green.
