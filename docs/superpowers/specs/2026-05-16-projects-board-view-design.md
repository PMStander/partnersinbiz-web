# Projects Board View — Design Spec

**Date:** 2026-05-16  
**Status:** Approved  
**Scope:** Portal projects page — add a List / Board view toggle where the Board shows all tasks across all projects in standard kanban status columns, with each card labeled by its source project.

---

## Overview

The portal projects page (`/portal/projects`) currently shows a grid of project cards. This spec adds a **Board** view that displays all task cards from all visible projects in a single cross-project kanban — grouped by task status, not by project. The existing **List** view is unchanged.

---

## Architecture

### Toggle placement

A segmented control (`List | Board`) is added to the page header, to the left of the "+ New Project" button. This matches the identical toggle pattern used on the per-project kanban page (`/portal/projects/[projectId]`).

State: `viewMode: 'list' | 'board'`, initialised to `'list'`. Stored in React component state only (no URL, no persistence — the page always opens in List view).

### Data loading

- **List view:** existing `GET /api/v1/projects` fetch only. No change.
- **Board view:** on first switch to Board, fetch tasks for every visible project in parallel — one `GET /api/v1/projects/{id}/tasks` call per project. Results are merged into a flat task array, each task annotated with its `projectId` and `projectName`. Subsequent filter changes in Board view re-trigger the parallel fetches for the new visible project set.

No new backend endpoints required.

### Filter behaviour

The existing project-status filter chips (All, Discovery, Design, Development, Review, Live, Maintenance) remain visible and functional in **both** views. In Board view the filter narrows which projects' tasks appear — tasks from filtered-out projects are excluded from the board.

### Columns

Five fixed columns, matching the per-project kanban defaults:

| id | Label | Colour |
|---|---|---|
| `backlog` | Backlog | `var(--color-outline)` |
| `todo` | To Do | `#60a5fa` |
| `in_progress` | In Progress | `var(--color-accent-v2)` |
| `review` | Review | `#c084fc` |
| `done` | Done | `#4ade80` |

Column order is fixed. No custom columns in this view (individual projects may have custom columns — the board maps all tasks to the nearest standard status or falls back to `backlog`).

---

## Components

### `ProjectsPage` (existing — `app/(portal)/portal/projects/page.tsx`)

Changes:
- Add `viewMode` state.
- Add `boardTasks` state: `Array<Task & { projectId: string; projectName: string }>`.
- Add `boardLoading` state.
- Render the toggle in the header.
- On `viewMode === 'board'`: render `<CrossProjectBoard>` instead of the project grid. Trigger parallel task fetches when viewMode switches to board or when `filtered` (visible projects) changes while in board view.

### `CrossProjectBoard` (new — `components/projects/CrossProjectBoard.tsx`)

A self-contained board component. Props:

```ts
interface CrossProjectBoardProps {
  tasks: Array<Task & { projectId: string; projectName: string }>
  loading: boolean
  onTaskUpdate: (projectId: string, taskId: string, patch: Partial<Task>) => void
}
```

Internally uses the existing `@dnd-kit` setup (`DndContext`, `SortableContext`, `DragOverlay`) — same pattern as `KanbanBoard.tsx`. On drag end, calls `onTaskUpdate` which fires `PATCH /api/v1/projects/{projectId}/tasks/{taskId}` with `{ columnId, order }`.

Renders five `<BoardColumn>` components.

### `BoardColumn` (new — `components/projects/BoardColumn.tsx`)

Props: `column`, `tasks` (pre-filtered to this column), standard dnd-kit sortable context. Renders a list of `<CrossProjectTaskCard>` components.

### `CrossProjectTaskCard` (new — `components/projects/CrossProjectTaskCard.tsx`)

A task card adapted for the cross-project context. Visually identical to the per-project kanban card but adds:

- **Project badge** — coloured pill showing `projectName`. Clicking it navigates to `/portal/projects/{projectId}`.
- **Priority dot** — colour-coded dot (urgent/high/medium/normal/low), same as existing card.
- **Card body click** — opens the existing task detail panel/modal scoped to that project and task.

Each project gets a stable colour derived from a simple hash of its `projectId` (modulo a fixed palette of 6 colours), so badge colours are consistent across sessions and independent of project list order. Palette: `#60a5fa`, `#c084fc`, `#34d399`, `#fb923c`, `#f472b6`, `#a78bfa` (background at 12% opacity, text at full).

---

## Drag-and-drop behaviour

Dragging a card between columns updates that task's `columnId` (and recalculates `order`) within its own project — exactly the same operation as the per-project kanban. Cards cannot be dragged between projects (the project association is fixed). Optimistic UI update: the card moves immediately, API call fires in background, reverts on failure.

---

## Loading states

- **Board loading skeleton:** when `boardLoading === true`, render five columns each containing 2–3 `pib-skeleton` placeholder cards (same skeleton used elsewhere in the portal).
- **Empty column:** show a subtle "Drop here" dashed-border placeholder (same pattern as per-project kanban).
- **No tasks:** if all projects have zero tasks, show a centred empty state: "No tasks yet. Open a project to add some."

---

## Error handling

- If one project's task fetch fails, skip it silently and continue rendering tasks from successful fetches. A small banner below the board header notes "Could not load tasks for N project(s)." with a Retry button that re-fetches only the failed projects.

---

## Out of scope

- Persisting the selected view mode to localStorage or the URL.
- Adding tasks from the board view (use the per-project kanban for that).
- Custom columns in the cross-project view.
- Filtering tasks by assignee, label, or priority within the board view.
- Admin-side equivalent (portal only for now).
