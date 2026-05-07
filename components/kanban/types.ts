export interface Attachment {
  id?: string
  uploadId?: string
  url: string
  name: string
  size?: number
  type?: string
  mimeType?: string
  storagePath?: string
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface TeamMember {
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  displayName?: string
  email?: string
  photoURL?: string
}

export interface Task {
  id: string
  title: string
  description?: string
  priority?: string
  columnId: string
  labels?: string[]
  assigneeId?: string | null
  assigneeIds?: string[]
  mentionIds?: string[]
  attachments?: Attachment[]
  checklist?: ChecklistItem[]
  dueDate?: unknown
  startDate?: unknown
  estimateMinutes?: number | null
  order: number
}

export interface Column {
  id: string
  name: string
  color: string
  order: number
  wipLimit?: number | null
}
