'use client'

import { useState, useCallback } from 'react'
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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ─────────────────────────────────────────────────────────────────

interface Attachment {
  url: string
  name: string
  size?: number
  type?: string
}

interface Task {
  id: string
  title: string
  description?: string
  priority?: string
  columnId: string
  labels?: string[]
  attachments?: Attachment[]
  dueDate?: any
  order: number
}

interface Column {
  id: string
  name: string
  color: string
  order: number
}

interface KanbanBoardProps {
  columns: Column[]
  tasks: Task[]
  projectId: string
  onTaskMove: (taskId: string, newColumnId: string, newOrder: number) => Promise<void>
  onTaskClick: (task: Task) => void
  onAddTask: (columnId: string) => void
}

// ── Priority styles ───────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, { color: string; label: string }> = {
  urgent: { color: '#ef4444', label: 'Urgent' },
  high:   { color: 'var(--color-accent-v2)', label: 'High' },
  medium: { color: '#60a5fa', label: 'Medium' },
  low:    { color: 'var(--color-outline)', label: 'Low' },
}

// ── Task Card ─────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onClick,
  isDragging = false,
}: {
  task: Task
  onClick: () => void
  isDragging?: boolean
}) {
  const priority = PRIORITY_STYLES[task.priority ?? 'medium']
  const attachmentCount = task.attachments?.length ?? 0

  return (
    <div
      onClick={onClick}
      className="pib-card cursor-pointer select-none transition-all duration-150 hover:border-[var(--color-accent-subtle)]"
      style={{
        opacity: isDragging ? 0.5 : 1,
        borderLeft: `3px solid ${priority.color}`,
        padding: '12px',
      }}
    >
      <p className="text-sm font-medium text-on-surface mb-1 leading-snug">{task.title}</p>
      {task.description && (
        <p className="text-xs text-on-surface-variant line-clamp-2 mb-2">{task.description}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span
          className="text-[9px] font-label uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: `${priority.color}20`, color: priority.color }}
        >
          {priority.label}
        </span>
        {task.labels?.slice(0, 2).map(l => (
          <span key={l} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">
            {l}
          </span>
        ))}
        {attachmentCount > 0 && (
          <span className="text-[9px] text-on-surface-variant ml-auto">
            📎 {attachmentCount}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Sortable Task Card ────────────────────────────────────────────────────

function SortableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onClick={onClick} isDragging={isDragging} />
    </div>
  )
}

// ── Kanban Column ─────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  onTaskClick,
  onAddTask,
}: {
  column: Column
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: () => void
}) {
  const taskIds = tasks.map(t => t.id)

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: column.color || 'var(--color-accent-v2)' }} />
          <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
            {column.name}
          </span>
          <span
            className="text-[9px] font-label px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }}
          >
            {tasks.length}
          </span>
        </div>
        <button
          onClick={onAddTask}
          className="text-on-surface-variant hover:text-on-surface transition-colors text-lg leading-none"
          title="Add task"
        >
          +
        </button>
      </div>

      {/* Task drop zone */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-24 flex-1">
          {tasks.map(task => (
            <SortableTaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
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

// ── Main Board ────────────────────────────────────────────────────────────

export function KanbanBoard({ columns, tasks: initialTasks, projectId, onTaskMove, onTaskClick, onAddTask }: KanbanBoardProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)

  const getTasksForColumn = useCallback(
    (columnId: string) =>
      tasks.filter(t => t.columnId === columnId).sort((a, b) => a.order - b.order),
    [tasks],
  )

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find(t => t.id === event.active.id)
    setActiveTask(task ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    // Determine target column
    const overTask = tasks.find(t => t.id === over.id)
    const targetColumnId = overTask ? overTask.columnId : (over.id as string)

    if (activeTask.columnId !== targetColumnId) {
      setTasks(prev => prev.map(t =>
        t.id === active.id ? { ...t, columnId: targetColumnId } : t
      ))
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return

    const movedTask = tasks.find(t => t.id === active.id)
    if (!movedTask) return

    const overTask = tasks.find(t => t.id === over.id)
    const targetColumnId = overTask ? overTask.columnId : (over.id as string)
    const newOrder = overTask ? overTask.order - 0.5 : Date.now()

    // Optimistic update already applied in handleDragOver
    await onTaskMove(movedTask.id, targetColumnId, newOrder)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
        {sortedColumns.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={getTasksForColumn(column.id)}
            onTaskClick={onTaskClick}
            onAddTask={() => onAddTask(column.id)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} onClick={() => {}} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
