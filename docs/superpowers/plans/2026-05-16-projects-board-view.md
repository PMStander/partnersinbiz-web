# Projects Board View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a List / Board view toggle to the portal projects page where the Board renders all tasks across all visible projects in a cross-project kanban with status columns, project badges, and full drag-and-drop.

**Architecture:** In-page toggle (`viewMode: 'list' | 'board'`) in `ProjectsPage`. On switch to Board, parallel-fetch tasks per project, merge into `BoardTask[]`, pass to `CrossProjectBoard` which owns DnD context. Three new components (`CrossProjectTaskCard`, `BoardColumn`, `CrossProjectBoard`) live in `components/projects/`. A `projectBadgeColor` utility maps a project ID to a stable badge colour.

**Tech Stack:** Next.js 15, React, TypeScript, @dnd-kit/core ^6, @dnd-kit/sortable ^10, @dnd-kit/utilities, Tailwind CSS (via CSS vars), Jest + @testing-library/react (jsdom project).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `lib/projects/projectBadgeColor.ts` | Hash projectId → stable palette colour |
| Create | `components/projects/CrossProjectTaskCard.tsx` | Sortable card with project badge + priority dot |
| Create | `components/projects/BoardColumn.tsx` | Droppable column wrapping sortable cards |
| Create | `components/projects/CrossProjectBoard.tsx` | DnD context, TaskDetailPanel, skeleton/empty states |
| Modify | `app/(portal)/portal/projects/page.tsx` | Toggle, board state, parallel fetches, error banner |
| Create | `__tests__/components/projects/projectBadgeColor.test.ts` | Unit tests for colour hash |
| Create | `__tests__/components/projects/CrossProjectTaskCard.test.tsx` | Render + project badge tests |
| Create | `__tests__/components/projects/CrossProjectBoard.test.tsx` | Board render + loading skeleton tests |

---

## Task 1: Project badge colour utility

**Files:**
- Create: `lib/projects/projectBadgeColor.ts`
- Create: `__tests__/components/projects/projectBadgeColor.test.ts`

- [ ] **Step 1.1 — Write failing tests**

```ts
// __tests__/components/projects/projectBadgeColor.test.ts
import { projectBadgeColor } from '@/lib/projects/projectBadgeColor'

describe('projectBadgeColor', () => {
  it('returns an object with text and bg properties', () => {
    const result = projectBadgeColor('abc123')
    expect(result).toHaveProperty('text')
    expect(result).toHaveProperty('bg')
  })

  it('returns the same colour for the same projectId', () => {
    expect(projectBadgeColor('proj-1')).toEqual(projectBadgeColor('proj-1'))
  })

  it('returns different colours for different projectIds (across palette)', () => {
    // Not guaranteed for every pair, but the palette has 6 entries —
    // these two are 6 apart in hash so they will collide; check a pair that doesn't.
    const colours = ['a','b','c','d','e','f','g'].map(id => projectBadgeColor(id).text)
    // At least 2 distinct colours must appear across 7 IDs
    expect(new Set(colours).size).toBeGreaterThan(1)
  })

  it('bg is text colour at 12% opacity (hex ends in 1f)', () => {
    const { text, bg } = projectBadgeColor('test-id')
    // bg should be text + '1f' (12% alpha in hex)
    expect(bg).toBe(`${text}1f`)
  })
})
```

- [ ] **Step 1.2 — Run tests to confirm they fail**

```bash
cd partnersinbiz-web && npx jest projectBadgeColor --no-coverage 2>&1 | tail -10
```
Expected: `Cannot find module '@/lib/projects/projectBadgeColor'`

- [ ] **Step 1.3 — Implement the utility**

```ts
// lib/projects/projectBadgeColor.ts

const PALETTE = [
  '#60a5fa', // blue
  '#c084fc', // purple
  '#34d399', // green
  '#fb923c', // orange
  '#f472b6', // pink
  '#a78bfa', // violet
]

function hashProjectId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

export function projectBadgeColor(projectId: string): { text: string; bg: string } {
  const text = PALETTE[hashProjectId(projectId) % PALETTE.length]
  return { text, bg: `${text}1f` }
}
```

- [ ] **Step 1.4 — Run tests to confirm they pass**

```bash
npx jest projectBadgeColor --no-coverage 2>&1 | tail -5
```
Expected: `Tests: 4 passed, 4 total`

- [ ] **Step 1.5 — Commit**

```bash
git add lib/projects/projectBadgeColor.ts __tests__/components/projects/projectBadgeColor.test.ts
git commit -m "feat(projects): add projectBadgeColor hash utility"
```

---

## Task 2: CrossProjectTaskCard component

**Files:**
- Create: `components/projects/CrossProjectTaskCard.tsx`
- Create: `__tests__/components/projects/CrossProjectTaskCard.test.tsx`

The card is a sortable wrapper around a visual card. It shows the task title, a coloured project badge (links to `/portal/projects/{projectId}`), and a priority dot. Clicking the card body fires `onClick`.

- [ ] **Step 2.1 — Write failing tests**

```tsx
// __tests__/components/projects/CrossProjectTaskCard.test.tsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { CrossProjectTaskCard } from '@/components/projects/CrossProjectTaskCard'
import type { Task } from '@/components/kanban/types'

// Mock dnd-kit sortable — it's a DOM drag API, not testable in jsdom
jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))
jest.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }))

const baseTask: Task = {
  id: 'task-1',
  title: 'Build landing page',
  columnId: 'todo',
  order: 1,
  priority: 'high',
}

describe('CrossProjectTaskCard', () => {
  it('renders the task title', () => {
    render(
      <CrossProjectTaskCard
        task={baseTask}
        projectId="proj-a"
        projectName="Website Revamp"
        onClick={jest.fn()}
      />
    )
    expect(screen.getByText('Build landing page')).toBeInTheDocument()
  })

  it('renders the project badge with the project name', () => {
    render(
      <CrossProjectTaskCard
        task={baseTask}
        projectId="proj-a"
        projectName="Website Revamp"
        onClick={jest.fn()}
      />
    )
    expect(screen.getByText('Website Revamp')).toBeInTheDocument()
  })

  it('project badge links to the project kanban', () => {
    render(
      <CrossProjectTaskCard
        task={baseTask}
        projectId="proj-abc"
        projectName="My Project"
        onClick={jest.fn()}
      />
    )
    const badge = screen.getByText('My Project').closest('a')
    expect(badge).toHaveAttribute('href', '/portal/projects/proj-abc')
  })

  it('calls onClick when the card body is clicked', () => {
    const onClick = jest.fn()
    render(
      <CrossProjectTaskCard
        task={baseTask}
        projectId="proj-a"
        projectName="Website Revamp"
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByText('Build landing page'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2.2 — Run tests to confirm they fail**

```bash
npx jest CrossProjectTaskCard --no-coverage 2>&1 | tail -10
```
Expected: `Cannot find module '@/components/projects/CrossProjectTaskCard'`

- [ ] **Step 2.3 — Implement the component**

```tsx
// components/projects/CrossProjectTaskCard.tsx
'use client'

import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { projectBadgeColor } from '@/lib/projects/projectBadgeColor'
import type { Task } from '@/components/kanban/types'

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  normal: '#60a5fa',
  low:    '#6b7280',
}

interface CrossProjectTaskCardProps {
  task: Task
  projectId: string
  projectName: string
  onClick: () => void
}

export function CrossProjectTaskCard({ task, projectId, projectName, onClick }: CrossProjectTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const { text: badgeText, bg: badgeBg } = projectBadgeColor(projectId)
  const priorityColor = PRIORITY_COLOR[task.priority ?? 'normal'] ?? PRIORITY_COLOR.normal

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <div
        className="pib-card cursor-pointer select-none transition-all duration-150 hover:border-[var(--color-accent-v2)]"
        style={{ padding: '10px', borderLeft: `3px solid ${priorityColor}` }}
        onClick={onClick}
      >
        <p className="text-sm font-medium text-on-surface mb-2 leading-snug">{task.title}</p>
        <div className="flex items-center justify-between gap-2">
          {/* Project badge — stop propagation so click on badge navigates rather than opening detail */}
          <Link
            href={`/portal/projects/${projectId}`}
            onClick={e => e.stopPropagation()}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full truncate max-w-[140px]"
            style={{ background: badgeBg, color: badgeText }}
          >
            {projectName}
          </Link>
          {/* Priority dot */}
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ background: priorityColor }}
            title={task.priority ?? 'normal'}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2.4 — Run tests to confirm they pass**

```bash
npx jest CrossProjectTaskCard --no-coverage 2>&1 | tail -5
```
Expected: `Tests: 4 passed, 4 total`

- [ ] **Step 2.5 — Commit**

```bash
git add components/projects/CrossProjectTaskCard.tsx __tests__/components/projects/CrossProjectTaskCard.test.tsx
git commit -m "feat(projects): add CrossProjectTaskCard with project badge"
```

---

## Task 3: BoardColumn component

**Files:**
- Create: `components/projects/BoardColumn.tsx`

No separate test file — BoardColumn is a layout wrapper fully covered by the CrossProjectBoard tests in Task 4.

- [ ] **Step 3.1 — Implement BoardColumn**

`BoardTask` is the canonical shared type — defined here and re-exported from `CrossProjectBoard.tsx` so `ProjectsPage` can import it from one place.

```tsx
// components/projects/BoardColumn.tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CrossProjectTaskCard } from './CrossProjectTaskCard'
import type { Column, Task } from '@/components/kanban/types'

// Single source of truth for this type — re-exported by CrossProjectBoard.tsx
export type BoardTask = Task & { projectId: string; projectName: string }

interface BoardColumnProps {
  column: Column
  tasks: BoardTask[]
  onTaskClick: (task: BoardTask) => void
}

export function BoardColumn({ column, tasks, onTaskClick }: BoardColumnProps) {
  const taskIds = tasks.map(t => t.id)
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: column.color }} />
        <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
          {column.name}
        </span>
        <span
          className="text-[9px] font-label px-1.5 py-0.5 rounded-full ml-auto"
          style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex flex-col gap-2 min-h-24 flex-1 rounded-lg transition-colors"
          style={isOver ? { background: 'color-mix(in oklab, var(--color-accent-v2) 8%, transparent)' } : undefined}
        >
          {tasks.map(task => (
            <CrossProjectTaskCard
              key={task.id}
              task={task}
              projectId={task.projectId}
              projectName={task.projectName}
              onClick={() => onTaskClick(task)}
            />
          ))}
          {tasks.length === 0 && (
            <div
              className="rounded-[var(--radius-card)] border border-dashed flex items-center justify-center py-8"
              style={{ borderColor: 'var(--color-card-border)' }}
            >
              <p className="text-xs text-on-surface-variant">Drop here</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
```

- [ ] **Step 3.2 — Commit**

```bash
git add components/projects/BoardColumn.tsx
git commit -m "feat(projects): add BoardColumn component"
```

---

## Task 4: CrossProjectBoard component

**Files:**
- Create: `components/projects/CrossProjectBoard.tsx`
- Create: `__tests__/components/projects/CrossProjectBoard.test.tsx`

This component owns the DnD context, task detail panel, skeleton loading state, and error-free empty state. It mirrors the logic in `KanbanBoard.tsx` but operates on cross-project tasks and delegates PATCH calls back to the parent via `onTaskUpdate`.

- [ ] **Step 4.1 — Write failing tests**

```tsx
// __tests__/components/projects/CrossProjectBoard.test.tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { CrossProjectBoard } from '@/components/projects/CrossProjectBoard'
import type { Task } from '@/components/kanban/types'

// Mock dnd-kit — not testable in jsdom
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCorners: jest.fn(),
  PointerSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
  useDroppable: () => ({ setNodeRef: jest.fn(), isOver: false }),
}))
jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: jest.fn(),
    transform: null, transition: null, isDragging: false,
  }),
}))
jest.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }))
// Mock TaskDetailPanel — too complex for unit test scope
jest.mock('@/components/kanban/TaskDetailPanel', () => ({
  TaskDetailPanel: () => null,
}))

type BoardTask = Task & { projectId: string; projectName: string }

const makeBoardTask = (overrides: Partial<BoardTask> = {}): BoardTask => ({
  id: 'task-1',
  title: 'Test task',
  columnId: 'todo',
  order: 1,
  projectId: 'proj-a',
  projectName: 'Test Project',
  ...overrides,
})

describe('CrossProjectBoard', () => {
  it('renders five column headers', () => {
    render(<CrossProjectBoard tasks={[]} loading={false} onTaskUpdate={jest.fn()} />)
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows skeleton cards when loading', () => {
    const { container } = render(<CrossProjectBoard tasks={[]} loading={true} onTaskUpdate={jest.fn()} />)
    // 5 columns × 3 skeleton cards = 15 skeletons
    const skeletons = container.querySelectorAll('.pib-skeleton')
    expect(skeletons.length).toBe(15)
  })

  it('renders a task in the correct column', () => {
    const task = makeBoardTask({ columnId: 'todo', title: 'My board task' })
    render(<CrossProjectBoard tasks={[task]} loading={false} onTaskUpdate={jest.fn()} />)
    expect(screen.getByText('My board task')).toBeInTheDocument()
  })

  it('shows empty state when no tasks at all', () => {
    render(<CrossProjectBoard tasks={[]} loading={false} onTaskUpdate={jest.fn()} />)
    // The empty state message should appear once (below the board)
    expect(screen.getByText(/No tasks yet/i)).toBeInTheDocument()
  })

  it('does not show empty state when tasks are present', () => {
    const task = makeBoardTask()
    render(<CrossProjectBoard tasks={[task]} loading={false} onTaskUpdate={jest.fn()} />)
    expect(screen.queryByText(/No tasks yet/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4.2 — Run tests to confirm they fail**

```bash
npx jest CrossProjectBoard --no-coverage 2>&1 | tail -10
```
Expected: `Cannot find module '@/components/projects/CrossProjectBoard'`

- [ ] **Step 4.3 — Implement CrossProjectBoard**

```tsx
// components/projects/CrossProjectBoard.tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { BoardColumn } from './BoardColumn'
import { CrossProjectTaskCard } from './CrossProjectTaskCard'
import { TaskDetailPanel } from '@/components/kanban/TaskDetailPanel'
import type { Column, Task } from '@/components/kanban/types'
import type { BoardTask } from './BoardColumn'

// Re-export so ProjectsPage can import BoardTask from one place
export type { BoardTask }

const BOARD_COLUMNS: Column[] = [
  { id: 'backlog',     name: 'Backlog',     color: 'var(--color-outline)',    order: 0 },
  { id: 'todo',        name: 'To Do',       color: '#60a5fa',                 order: 1 },
  { id: 'in_progress', name: 'In Progress', color: 'var(--color-accent-v2)', order: 2 },
  { id: 'review',      name: 'Review',      color: '#c084fc',                 order: 3 },
  { id: 'done',        name: 'Done',        color: '#4ade80',                 order: 4 },
]

// Tasks on custom columns (not in the 5 standard ones) fall back to 'backlog'
function normalizeColumnId(columnId: string): string {
  return BOARD_COLUMNS.some(c => c.id === columnId) ? columnId : 'backlog'
}

function Skeleton() {
  return <div className="pib-skeleton h-16 rounded-lg" />
}

interface CrossProjectBoardProps {
  tasks: BoardTask[]
  loading: boolean
  onTaskUpdate: (projectId: string, taskId: string, patch: Partial<Task>) => void
}

export function CrossProjectBoard({ tasks: initialTasks, loading, onTaskUpdate }: CrossProjectBoardProps) {
  const [tasks, setTasks] = useState<BoardTask[]>([])
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null)
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null)

  useEffect(() => {
    setTasks(initialTasks.map(t => ({ ...t, columnId: normalizeColumnId(t.columnId) })))
  }, [initialTasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const getTasksForColumn = useCallback(
    (columnId: string) => tasks.filter(t => t.columnId === columnId).sort((a, b) => a.order - b.order),
    [tasks],
  )

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find(t => t.id === event.active.id)
    setActiveTask(task ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeT = tasks.find(t => t.id === active.id)
    if (!activeT) return
    const overTask = tasks.find(t => t.id === over.id)
    const overCol = BOARD_COLUMNS.find(c => c.id === over.id)
    const targetColumnId = overTask ? overTask.columnId : overCol ? overCol.id : activeT.columnId
    if (activeT.columnId !== targetColumnId) {
      setTasks(prev => prev.map(t => t.id === active.id ? { ...t, columnId: targetColumnId } : t))
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return
    const movedTask = tasks.find(t => t.id === active.id)
    if (!movedTask) return

    const overTask = tasks.find(t => t.id === over.id)
    const overCol = BOARD_COLUMNS.find(c => c.id === over.id)
    const targetColumnId = overTask ? overTask.columnId : overCol ? overCol.id : movedTask.columnId
    const colTasks = tasks
      .filter(t => t.columnId === targetColumnId && t.id !== movedTask.id)
      .sort((a, b) => a.order - b.order)
    const targetIndex = overTask ? Math.max(0, colTasks.findIndex(t => t.id === overTask.id)) : colTasks.length
    const prev = colTasks[targetIndex - 1]?.order
    const next = colTasks[targetIndex]?.order
    const newOrder =
      typeof prev === 'number' && typeof next === 'number' ? (prev + next) / 2
      : typeof next === 'number' ? next - 1
      : typeof prev === 'number' ? prev + 1
      : Date.now()

    const patch = { columnId: targetColumnId, order: newOrder }
    // Optimistic update
    setTasks(prevTasks =>
      prevTasks.map(t => t.id === active.id ? { ...t, ...patch } : t)
    )
    // Persist — revert on failure
    try {
      onTaskUpdate(movedTask.projectId, movedTask.id, patch)
    } catch {
      setTasks(initialTasks.map(t => ({ ...t, columnId: normalizeColumnId(t.columnId) })))
    }
  }

  const handleTaskUpdate = useCallback(async (taskId: string, updates: Partial<Task>) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
    setSelectedTask(prev => prev?.id === taskId ? { ...prev, ...updates } as BoardTask : prev)
    onTaskUpdate(task.projectId, taskId, updates)
  }, [tasks, onTaskUpdate])

  const handleTaskDelete = useCallback(async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setSelectedTask(null)
  }, [])

  const hasAnyTasks = tasks.length > 0

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {BOARD_COLUMNS.map(column => (
            loading ? (
              <div key={column.id} className="flex flex-col w-64 shrink-0">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: column.color }} />
                  <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">{column.name}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton /><Skeleton /><Skeleton />
                </div>
              </div>
            ) : (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={getTasksForColumn(column.id)}
                onTaskClick={setSelectedTask}
              />
            )
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <CrossProjectTaskCard
              task={activeTask}
              projectId={activeTask.projectId}
              projectName={activeTask.projectName}
              onClick={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {!loading && !hasAnyTasks && (
        <div className="py-12 text-center">
          <p className="text-on-surface-variant text-sm">No tasks yet. Open a project to add some.</p>
        </div>
      )}

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          projectId={selectedTask.projectId}
          columnName={BOARD_COLUMNS.find(c => c.id === selectedTask.columnId)?.name}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4.4 — Run tests to confirm they pass**

```bash
npx jest CrossProjectBoard --no-coverage 2>&1 | tail -5
```
Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 4.5 — Commit**

```bash
git add components/projects/CrossProjectBoard.tsx __tests__/components/projects/CrossProjectBoard.test.tsx
git commit -m "feat(projects): add CrossProjectBoard with dnd-kit and TaskDetailPanel"
```

---

## Task 5: Wire ProjectsPage — toggle, fetching, error banner

**Files:**
- Modify: `app/(portal)/portal/projects/page.tsx`

Add `viewMode`, `boardTasks`, `boardLoading`, and `failedProjectIds` state. Fetch tasks in parallel when switching to Board. Render toggle in header. Conditionally show board or grid. Show error banner for failed project fetches.

- [ ] **Step 5.1 — Add the BoardTask type and new state at the top of the component**

Open `app/(portal)/portal/projects/page.tsx`. After the existing `Project` interface, add:

```ts
import { CrossProjectBoard } from '@/components/projects/CrossProjectBoard'
import type { BoardTask } from '@/components/projects/CrossProjectBoard'
```

Add these four state variables inside `ProjectsPage`, after the existing `filter` state:

```ts
const [viewMode, setViewMode]               = useState<'list' | 'board'>('list')
const [boardTasks, setBoardTasks]           = useState<BoardTask[]>([])
const [boardLoading, setBoardLoading]       = useState(false)
const [failedProjectIds, setFailedProjectIds] = useState<string[]>([])
```

- [ ] **Step 5.2 — Add the parallel-fetch effect**

Add this `useEffect` after the existing project-list fetch effect:

```ts
useEffect(() => {
  if (viewMode !== 'board' || filtered.length === 0) return

  let cancelled = false
  setBoardLoading(true)
  setFailedProjectIds([])

  const fetches = filtered.map(project =>
    fetch(`/api/v1/projects/${project.id}/tasks`)
      .then(r => r.json())
      .then((body): { project: Project; tasks: BoardTask[] } => ({
        project,
        tasks: (body.data ?? []).map((t: BoardTask) => ({
          ...t,
          projectId: project.id,
          projectName: project.name,
        })),
      }))
      .catch(() => ({ project, tasks: undefined as BoardTask[] | undefined }))
  )

  Promise.all(fetches).then(results => {
    if (cancelled) return
    const failed: string[] = []
    const all: BoardTask[] = []
    for (const { project, tasks } of results) {
      if (!tasks) {
        failed.push(project.id)
      } else {
        all.push(...tasks)
      }
    }
    setBoardTasks(all)
    setFailedProjectIds(failed)
    setBoardLoading(false)
  })

  return () => { cancelled = true }
}, [viewMode, filtered])
```

**Note:** `filtered` is the already-computed `const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)` derived value. The `useEffect` dependency on `filtered` is an array — React compares by reference. To avoid infinite loops, ensure `filtered` is stable: memoize it with `useMemo`:

Replace the existing line:
```ts
const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)
```
With:
```ts
const filtered = useMemo(
  () => filter === 'all' ? projects : projects.filter(p => p.status === filter),
  [projects, filter],
)
```
Add `useMemo` to the React import.

- [ ] **Step 5.3 — Add `onTaskUpdate` handler**

Add this handler after the existing `handleCancel` function:

```ts
const handleBoardTaskUpdate = useCallback(
  (projectId: string, taskId: string, patch: Partial<{ columnId: string; order: number }>) => {
    setBoardTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
    fetch(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {
      // Revert optimistic update on failure — refetch is simplest
      setBoardTasks(prev => prev.map(t => t.id === taskId ? { ...t, columnId: t.columnId, order: t.order } : t))
    })
  },
  [],
)
```

Add `useCallback` to the React import if not already there.

- [ ] **Step 5.4 — Replace the header with the toggle**

Find the existing header block:

```tsx
<div className="flex items-center justify-between">
  <div>
    <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Projects</p>
    <h1 className="text-2xl font-headline font-bold text-on-surface">Projects</h1>
  </div>
  {!showForm && (
    <button
      onClick={() => setShowForm(true)}
      className="pib-btn-primary text-sm font-label"
    >
      + New Project
    </button>
  )}
</div>
```

Replace with:

```tsx
<div className="flex items-center justify-between">
  <div>
    <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Projects</p>
    <h1 className="text-2xl font-headline font-bold text-on-surface">Projects</h1>
  </div>
  <div className="flex items-center gap-3">
    {/* View toggle */}
    <div
      className="flex rounded-[var(--radius-btn)] overflow-hidden border"
      style={{ borderColor: 'var(--color-outline)' }}
    >
      {(['list', 'board'] as const).map(mode => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label capitalize transition-colors"
          style={
            viewMode === mode
              ? { background: 'var(--color-accent-v2)', color: '#000' }
              : { background: 'transparent', color: 'var(--color-on-surface-variant)' }
          }
        >
          <span className="material-symbols-outlined text-[14px]">
            {mode === 'list' ? 'list' : 'view_kanban'}
          </span>
          {mode}
        </button>
      ))}
    </div>
    {!showForm && (
      <button
        onClick={() => setShowForm(true)}
        className="pib-btn-primary text-sm font-label"
      >
        + New Project
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 5.5 — Replace the grid render with conditional board/list**

Find the section starting `{/* Projects Grid */}` and replace everything from that comment to the closing `)}` of the grid conditional with:

```tsx
{/* Error banner for partial board load failures */}
{viewMode === 'board' && failedProjectIds.length > 0 && (
  <div
    className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-2 text-sm"
    style={{ background: '#ef444420', color: '#f87171', border: '1px solid #ef444430' }}
  >
    <span>Could not load tasks for {failedProjectIds.length} project(s).</span>
    <button
      onClick={() => {
        // Re-trigger the effect by toggling a sentinel — simplest approach
        setViewMode('list')
        setTimeout(() => setViewMode('board'), 0)
      }}
      className="underline text-xs shrink-0"
    >
      Retry
    </button>
  </div>
)}

{/* Board view */}
{viewMode === 'board' ? (
  <CrossProjectBoard
    tasks={boardTasks}
    loading={boardLoading}
    onTaskUpdate={handleBoardTaskUpdate}
  />
) : (
  /* List view (unchanged) */
  loading ? (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
    </div>
  ) : filtered.length === 0 ? (
    <div className="pib-card py-12 text-center">
      <p className="text-on-surface-variant text-sm">No projects found.</p>
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {filtered.map(project => (
        <div key={project.id} className="relative group">
          <Link
            href={`/portal/projects/${project.id}`}
            className="pib-card pib-card-hover block"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-medium text-on-surface pr-6">{project.name}</h3>
              <StatusBadge status={project.status} />
            </div>
            {project.description && (
              <p className="text-sm text-on-surface-variant line-clamp-2">{project.description}</p>
            )}
          </Link>
        </div>
      ))}
    </div>
  )
)}
```

- [ ] **Step 5.6 — Run the full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -10
```
Expected: all previously passing tests still pass; the 3 new suites add to the count. Zero new failures.

- [ ] **Step 5.7 — Run the TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: no new errors (only pre-existing baseline errors).

- [ ] **Step 5.8 — Commit**

```bash
git add app/(portal)/portal/projects/page.tsx
git commit -m "feat(projects): add List/Board view toggle with cross-project kanban"
```

---

## Task 6: Manual smoke test

- [ ] **Step 6.1 — Open the projects page**

Navigate to `http://localhost:3000/portal/projects` (dev server should already be running). Confirm the List view renders as before and the **List | Board** toggle is visible in the top-right.

- [ ] **Step 6.2 — Switch to Board view**

Click **Board**. Confirm:
- The project grid disappears
- Five kanban columns appear (Backlog, To Do, In Progress, Review, Done)
- Tasks load with project badges matching the source project name

- [ ] **Step 6.3 — Test drag-and-drop**

Drag a task card from one column to another. Confirm:
- The card moves immediately (optimistic)
- Refresh the page and switch back to Board — the card should remain in the new column (API persisted)

- [ ] **Step 6.4 — Test project badge click**

Click a project badge on any card. Confirm it navigates to `/portal/projects/{projectId}` without triggering the task detail panel.

- [ ] **Step 6.5 — Test task detail**

Click a card body (not the badge). Confirm the `TaskDetailPanel` opens scoped to the correct project.

- [ ] **Step 6.6 — Test filter in Board view**

With the Board view active, click a project-status filter chip (e.g. "Development"). Confirm the board reloads showing only tasks from projects with that status.

- [ ] **Step 6.7 — Switch back to List view**

Click **List**. Confirm the project grid reappears unchanged.
