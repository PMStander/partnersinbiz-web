import { adminDb } from '@/lib/firebase/admin'

export type MemberRefKind = 'human' | 'agent' | 'system'

export interface MemberRef {
  uid: string
  displayName: string
  avatarUrl?: string
  jobTitle?: string
  kind: MemberRefKind
}

export const AGENT_PIP_REF: MemberRef = {
  uid: 'agent:pip',
  displayName: 'Pip',
  jobTitle: 'AI Agent',
  kind: 'agent',
}

export const LEGACY_REF: MemberRef = {
  uid: 'system:legacy',
  displayName: 'Imported',
  jobTitle: 'Pre-CRM-rewire',
  kind: 'system',
}

export function FORMER_MEMBER_REF(uid: string): MemberRef {
  return {
    uid,
    displayName: 'Former member',
    kind: 'system',
  }
}

export function formSubmissionRef(formId: string, formName: string): MemberRef {
  return {
    uid: `system:form-submission:${formId}`,
    displayName: formName,
    kind: 'system',
  }
}

export function buildHumanRef(uid: string, data: Record<string, unknown> | undefined): MemberRef {
  if (!data) return FORMER_MEMBER_REF(uid)
  const firstName = (data.firstName as string | undefined) ?? ''
  const lastName = (data.lastName as string | undefined) ?? ''
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || uid
  const ref: MemberRef = { uid, displayName, kind: 'human' }
  if (data.jobTitle) ref.jobTitle = data.jobTitle as string
  if (data.avatarUrl) ref.avatarUrl = data.avatarUrl as string
  return ref
}

export async function resolveMemberRef(orgId: string, uid: string): Promise<MemberRef> {
  const snap = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
  if (!snap.exists) return FORMER_MEMBER_REF(uid)
  return buildHumanRef(uid, snap.data())
}

export async function snapshotForWrite(orgId: string, uid: string): Promise<MemberRef> {
  const snap = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
  if (!snap.exists) {
    throw new Error(`snapshotForWrite: ${uid} is not a member of org ${orgId}`)
  }
  return buildHumanRef(uid, snap.data())
}
