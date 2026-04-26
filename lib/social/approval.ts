/**
 * Two-stage approval state machine for social posts.
 *
 * Flow:
 *   draft
 *     -> submit() -> qa_review (default) or client_review (if !requiresQa) or approved (if !requiresApproval)
 *   qa_review
 *     -> qaApprove() -> client_review (if requiresClientReview) or approved
 *     -> qaReject() -> regenerating
 *   client_review (== legacy pending_approval, treated equivalently for read paths)
 *     -> clientApprove() -> approved -> auto-finalises per deliveryMode
 *     -> clientReject() -> regenerating
 *   regenerating
 *     -> regenerationComplete() -> qa_review
 *   approved
 *     -> finalise() -> scheduled (auto_publish), vaulted (download_only), or both
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type {
  ApprovalState,
  DeliveryMode,
  PostStatus,
  RejectionRecord,
  RejectionStage,
} from '@/lib/social/providers'

export const QA_REVIEW_STATUSES: PostStatus[] = ['qa_review']
export const CLIENT_REVIEW_STATUSES: PostStatus[] = ['client_review', 'pending_approval']
export const APPROVED_STATUSES: PostStatus[] = ['approved', 'vaulted', 'scheduled', 'publishing', 'published']
export const VAULT_VISIBLE_STATUSES: PostStatus[] = ['approved', 'vaulted', 'scheduled', 'publishing', 'published', 'partially_published']

export function emptyApprovalState(): ApprovalState {
  return {
    qaApprovedBy: null,
    qaApprovedAt: null,
    clientApprovedBy: null,
    clientApprovedAt: null,
    rejectionCount: 0,
    regenerationCount: 0,
    lastRejectionStage: null,
    lastRejectedAt: null,
    history: [],
  }
}

export interface OrgApprovalSettings {
  requiresQaApproval: boolean
  requiresClientApproval: boolean
  defaultDeliveryMode: DeliveryMode
}

const DEFAULT_ORG_SETTINGS: OrgApprovalSettings = {
  requiresQaApproval: true,
  requiresClientApproval: true,
  defaultDeliveryMode: 'auto_publish',
}

export async function getOrgApprovalSettings(orgId: string): Promise<OrgApprovalSettings> {
  const doc = await adminDb.collection('organizations').doc(orgId).get()
  const settings = doc.data()?.settings ?? {}
  const social = settings.social ?? {}
  return {
    requiresQaApproval: social.requiresQaApproval ?? settings.defaultApprovalRequired ?? DEFAULT_ORG_SETTINGS.requiresQaApproval,
    requiresClientApproval: social.requiresClientApproval ?? DEFAULT_ORG_SETTINGS.requiresClientApproval,
    defaultDeliveryMode: social.defaultDeliveryMode ?? DEFAULT_ORG_SETTINGS.defaultDeliveryMode,
  }
}

/**
 * Resolve the next status when a post is submitted from draft, given org settings
 * and per-post requiresApproval flag.
 */
export function resolveSubmitStatus(opts: {
  requiresApproval: boolean
  requiresQa: boolean
  requiresClient: boolean
}): PostStatus {
  if (!opts.requiresApproval) return 'approved'
  if (opts.requiresQa) return 'qa_review'
  if (opts.requiresClient) return 'client_review'
  return 'approved'
}

/**
 * Resolve the next status after QA approval.
 * - If client review required -> client_review
 * - Otherwise -> approved
 */
export function resolveAfterQaApproval(requiresClient: boolean): PostStatus {
  return requiresClient ? 'client_review' : 'approved'
}

/**
 * Resolve the destination status after final approval, based on delivery mode.
 * - auto_publish -> scheduled (if scheduledAt) or approved (otherwise)
 * - download_only -> vaulted
 * - both -> scheduled or vaulted depending on whether scheduledAt is set
 */
export function resolveAfterFinalApproval(opts: {
  deliveryMode: DeliveryMode
  hasScheduledAt: boolean
}): PostStatus {
  if (opts.deliveryMode === 'download_only') return 'vaulted'
  if (opts.deliveryMode === 'auto_publish') return opts.hasScheduledAt ? 'scheduled' : 'approved'
  // both
  return opts.hasScheduledAt ? 'scheduled' : 'vaulted'
}

export type ApprovalAction =
  | 'submit'
  | 'qa_approve'
  | 'qa_reject'
  | 'client_approve'
  | 'client_reject'
  | 'regenerate_start'
  | 'regenerate_complete'

/**
 * Validate that a status transition is allowed for the given action.
 * Returns null if valid, or an error string if invalid.
 */
export function validateTransition(from: PostStatus, action: ApprovalAction): string | null {
  switch (action) {
    case 'submit':
      if (from !== 'draft') return `Cannot submit from status "${from}" — must be draft`
      return null
    case 'qa_approve':
    case 'qa_reject':
      if (from !== 'qa_review') return `Cannot ${action.replace('_', ' ')} from status "${from}" — must be qa_review`
      return null
    case 'client_approve':
    case 'client_reject':
      if (!CLIENT_REVIEW_STATUSES.includes(from)) {
        return `Cannot ${action.replace('_', ' ')} from status "${from}" — must be client_review`
      }
      return null
    case 'regenerate_start':
      if (from !== 'qa_review' && !CLIENT_REVIEW_STATUSES.includes(from)) {
        return `Cannot regenerate from status "${from}" — must be qa_review or client_review`
      }
      return null
    case 'regenerate_complete':
      if (from !== 'regenerating') return `Cannot complete regeneration from status "${from}"`
      return null
    default:
      return `Unknown action "${action as string}"`
  }
}

/**
 * Build a rejection record to append to approval.history.
 */
export function buildRejectionRecord(opts: {
  stage: RejectionStage
  reason: string
  rejectedBy: string
  rejectedByName: string
}): Omit<RejectionRecord, 'rejectedAt'> & { rejectedAt: FirebaseFirestore.FieldValue } {
  return {
    stage: opts.stage,
    reason: opts.reason,
    rejectedBy: opts.rejectedBy,
    rejectedByName: opts.rejectedByName,
    rejectedAt: FieldValue.serverTimestamp(),
    resolved: false,
  }
}

/**
 * Convenience: is this status one a reviewer (admin or client) needs to act on?
 */
export function needsAction(status: PostStatus, role: 'admin' | 'client' | 'ai'): boolean {
  if (role === 'admin') return status === 'qa_review' || status === 'regenerating'
  if (role === 'client') return CLIENT_REVIEW_STATUSES.includes(status)
  if (role === 'ai') return status === 'regenerating'
  return false
}
