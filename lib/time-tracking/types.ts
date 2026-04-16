/**
 * Time tracking domain types.
 *
 * A `TimeEntry` is a single span of work by a user. It may be:
 *   - running  — `endAt` is null and `durationMinutes` is 0
 *   - stopped  — `endAt` is set and `durationMinutes` is computed
 *   - billed   — `invoiceId` is set (non-null)
 *
 * Entries are org-scoped and soft-deleted. Billed entries are immutable (see
 * `PUT /api/v1/time-entries/[id]` and `DELETE /api/v1/time-entries/[id]`).
 */

export interface TimeEntry {
  id: string
  orgId: string
  userId: string
  projectId: string | null
  taskId: string | null
  clientOrgId: string | null
  description: string
  /** ISO timestamp — when the entry started */
  startAt: string
  /** ISO timestamp — when the entry stopped; null while running */
  endAt: string | null
  /** Minutes elapsed. 0 while running; computed on stop. */
  durationMinutes: number
  billable: boolean
  hourlyRate: number | null
  currency: string
  /** Set when the entry has been added to an invoice */
  invoiceId: string | null
  tags: string[]
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  createdAt: unknown
  updatedAt: unknown
  deleted: boolean
}

export interface TimeEntryInput {
  /** Defaults to the current authenticated user */
  userId?: string
  projectId?: string
  taskId?: string
  clientOrgId?: string
  description: string
  /** ISO — required */
  startAt: string
  /** ISO — optional; pair with `durationMinutes` or provide both */
  endAt?: string
  durationMinutes?: number
  billable?: boolean
  hourlyRate?: number
  currency?: string
  tags?: string[]
}
