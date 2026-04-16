// lib/tasks/types.ts
// Types for the standalone tasks module (personal + cross-project tasks).

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface TaskAssignee {
  type: 'user' | 'agent'
  id: string
}

export interface Task {
  id: string
  orgId: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null // ISO
  assignedTo: TaskAssignee | null
  projectId: string | null
  contactId: string | null
  dealId: string | null
  tags: string[]
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  createdAt: unknown
  updatedAt: unknown
  completedAt: unknown | null
  deleted: boolean
}

export interface TaskInput {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: string
  assignedTo?: TaskAssignee
  projectId?: string
  contactId?: string
  dealId?: string
  tags?: string[]
}

export const VALID_TASK_STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'done',
  'cancelled',
]

export const VALID_TASK_PRIORITIES: TaskPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
]

export const VALID_ASSIGNEE_TYPES: TaskAssignee['type'][] = ['user', 'agent']
