// lib/notifications/types.ts
// Types for the persistent notifications feed.

export type NotificationStatus = 'unread' | 'read' | 'archived' | 'snoozed'
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Notification {
  id: string
  orgId: string
  userId: string | null
  agentId: string | null
  type: string // e.g. 'task.assigned', 'invoice.paid', 'mention', 'form.submitted'
  title: string
  body: string
  link: string | null
  data: Record<string, unknown> | null
  priority: NotificationPriority
  status: NotificationStatus
  snoozedUntil: string | null
  readAt: unknown | null
  createdAt: unknown
}

export const VALID_NOTIFICATION_STATUSES: NotificationStatus[] = [
  'unread',
  'read',
  'archived',
  'snoozed',
]

export const VALID_NOTIFICATION_PRIORITIES: NotificationPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
]
