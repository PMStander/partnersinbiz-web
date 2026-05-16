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
          <Link
            href={`/portal/projects/${projectId}`}
            onClick={e => e.stopPropagation()}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full truncate max-w-[140px]"
            style={{ background: badgeBg, color: badgeText }}
          >
            {projectName}
          </Link>
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
