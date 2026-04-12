/**
 * Social Audit Logger — Writes audit events to the social_audit_log collection.
 *
 * Tracks: post created/published/failed, account connected/disconnected.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { AuditAction, AuditEntityType } from '@/lib/social/providers'

export interface AuditOptions {
  orgId: string
  action: AuditAction
  entityType: AuditEntityType
  entityId: string
  performedBy: string
  performedByRole: 'admin' | 'client' | 'ai' | 'system'
  details?: Record<string, unknown>
  ip?: string | null
}

/**
 * Log an audit event to social_audit_log.
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
export async function logAudit(options: AuditOptions): Promise<void> {
  try {
    await adminDb.collection('social_audit_log').add({
      orgId: options.orgId,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      performedBy: options.performedBy,
      performedByRole: options.performedByRole,
      details: options.details ?? {},
      ip: options.ip ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    // Audit logging must never break the main flow
    console.error('[audit] Failed to write audit log:', err)
  }
}
