# Chat UX Polish — Design Spec

**Date:** 2026-05-13
**Scope:** `components/hermes/Chat.tsx` + finalize route + conversations lib
**Status:** Approved

---

## Context

The Hermes chat surface shipped on 2026-05-13. Three UX gaps identified:

1. Tool-call events disappear after a run completes (live-only, not persisted)
2. No UI for approving tool calls when a run pauses for permission
3. No way to rename or archive conversations from the sidebar

---

## Feature 1 — Persistent Tool-Call Cards

### Behaviour

- During a live run, SSE events are already collected into `liveEvents[msgId]` in React state.
- After the run completes, those events are persisted to Firestore and surfaced on future page loads.
- A collapsible `<details>` toggle renders above the response bubble for any message that has events.
- **Collapsed:** shows `▶ N tool calls` summary line.
- **Expanded:** timestamped timeline trace — one row per event: `HH:MM:SS | tool_name (coloured) | preview text`.

### Data changes

**`lib/hermes/types.ts`** (or inline in `conversations.ts`)
- Move/define `ChatEvent` type here so it can be shared between the lib and the client component:
  ```ts
  export type ChatEvent = {
    event?: string
    tool?: string
    preview?: string
    timestamp?: number
  }
  ```

**`lib/hermes/conversations.ts`**
- Import `ChatEvent` from `lib/hermes/types.ts`.
- Add `events?: ChatEvent[]` to `HermesMessage` interface.
- `updateMessage` already accepts `Partial<HermesMessage>` — no signature change needed.

**Finalize route** (`…/messages/[msgId]/finalize/route.ts`)
- Accept optional `events: ChatEvent[]` from the request body (client sends its accumulated `liveEvents[msgId]`).
- When saving a completed message, include `events` in the `updateMessage` call if provided and non-empty.

**`Chat.tsx`**
- In the `pollFinalize` / `send` flow, pass `events: liveEvents[newAssistantId] ?? []` in the finalize POST body.
- Merge display events: `const displayEvents = liveEvents[m.id]?.length ? liveEvents[m.id] : (m.events ?? [])`.
- Replace the current `m.status !== 'completed'` guard with the merged array and the `<details>` pattern.

### `ChatMessage` type extension (client-side)

```ts
type ChatMessage = {
  // existing fields …
  events?: ChatEvent[]   // persisted after run completes
}
```

---

## Feature 2 — Inline Approval Card

### Behaviour

When a run pauses waiting for tool-call permission:
- The finalize polling detects `status === 'waiting_for_approval'` from Hermes.
- The assistant message transitions to a new `'waiting_approval'` status.
- An amber inline card renders **below** the message bubble (in the thread, not floating):
  - Shows the tool name sourced from the last `liveEvents` entry for that message (fallback: "a tool").
  - Three buttons: **Allow once**, **Allow always**, **Deny**.
- Clicking a button calls `POST /api/v1/admin/hermes/profiles/{orgId}/runs/{runId}/approval` with `{ choice: 'once' | 'always' | 'deny' }`.
- On success, polling resumes via `pollFinalize`.

### Finalize route change

Add one branch before the existing `else` (pending) return:

```ts
if (status === 'waiting_for_approval' || status === 'approval_required') {
  return apiSuccess({ status, pending: false, waitingForApproval: true })
}
```

### `Chat.tsx` changes

- Extend `ChatMessage.status` union: add `'waiting_approval'`.
- New state: `approvalPending: Record<string, { runId: string; toolName?: string }>`.
- In `pollFinalize`: when `body.data.waitingForApproval === true`, set message status to `'waiting_approval'` and populate `approvalPending[msgId]`.
- New `resolveApproval(msgId, choice)` handler: calls the approval API, clears `approvalPending[msgId]`, resets message status to `'pending'`, resumes `pollFinalize`.
- Approval card JSX: amber left-border inline block, `<span>` for tool name, 3 `<button>` elements.

### Visual design (approved in brainstorm)

```
┌─ amber border ──────────────────────────────────────┐
│ ⏸ Waiting for approval                              │
│ I want to call  update_task — task-42 → "done"      │
│ [Allow once]  [Allow always]  [Deny]                │
└─────────────────────────────────────────────────────┘
```

Colours: amber `#f59e0b`, bg `#1a1500`, border `#f59e0b44`. Buttons: green / blue / red tints.

---

## Feature 3 — Rename + Archive (⋯ hover menu)

### Behaviour

- Each conversation list item in the sidebar has a `⋯` icon button that appears on hover (`group/group-hover` Tailwind pattern).
- Clicking `⋯` opens a small absolute dropdown with two items: **Rename** and **Archive**.
- **Rename:** replaces the title `<span>` with an `<input>` pre-filled with the current title. Enter or blur saves via `PATCH { title }` to `/api/v1/admin/hermes/profiles/{orgId}/conversations/{convId}`. Updates `conversations` local state.
- **Archive:** calls `PATCH { archived: true }`. Removes the conversation from the local `conversations` state immediately (optimistic). Does not require a confirmation dialog.
- Archived conversations are excluded from the rendered list via `conversations.filter(c => !c.archived)`.

### API

Already exists — `PATCH /api/v1/admin/hermes/profiles/{orgId}/conversations/{convId}` accepts `{ title?, archived? }`. No backend changes needed.

### `Chat.tsx` changes

- New state: `menuOpenId: string | null` (which conversation has the dropdown open).
- New state: `renamingId: string | null` + `renameValue: string`.
- `useEffect` to close dropdown on outside click (`mousedown` listener).
- Dropdown positioned `absolute right-0 top-6 z-10` on the list item wrapper.

---

## Files Changed

| File | Change |
|---|---|
| `lib/hermes/conversations.ts` | Add `events?: ChatEvent[]` to `HermesMessage` |
| `app/api/v1/admin/hermes/profiles/[orgId]/conversations/[convId]/messages/[msgId]/finalize/route.ts` | Accept events in body; detect `waiting_for_approval` |
| `components/hermes/Chat.tsx` | All UI: tool-call details, approval card, ⋯ sidebar |

---

## Out of Scope

- Conversation delete (already exists as admin-only DELETE route)
- Pagination of archived conversations
- `Allow session` choice (Hermes supports it but not exposing in this iteration)
- Mobile-optimised approval UI
