import type { Timestamp } from 'firebase-admin/firestore'

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface KanbanColumn {
  id: string
  name: string
  color: string
  order: number
  wipLimit?: number | null
}

export interface ProjectDocument {
  id?: string
  title: string
  content: string           // markdown content
  type: 'brief' | 'requirements' | 'notes' | 'reference'
  createdBy: string
  updatedBy?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface Project {
  id?: string
  orgId: string
  name: string
  description: string
  status: ProjectStatus
  columns: KanbanColumn[]
  dueDate?: unknown | null
  tags: string[]
  createdBy: string
  brief?: string              // Quick project brief (1-2 paragraphs, stored on project doc)
  createdAt?: unknown
  updatedAt?: unknown
}

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>

export interface Attachment {
  url: string
  name: string
  size: number
  type: string
}

export interface Task {
  id?: string
  orgId: string
  projectId: string
  columnId: string
  title: string
  description: string
  priority: TaskPriority
  assigneeId: string | null
  reporterId: string
  labels: string[]
  attachments?: Attachment[]
  dueDate?: unknown | null
  order: number
  createdAt?: unknown
  updatedAt?: unknown
}

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>

export interface TaskComment {
  id?: string
  taskId: string
  userId: string
  userName: string
  text: string
  createdAt?: unknown
}
