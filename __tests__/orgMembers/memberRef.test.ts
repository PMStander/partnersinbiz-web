import { Timestamp } from 'firebase-admin/firestore'

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(),
  },
}))

import { adminDb } from '@/lib/firebase/admin'
import {
  AGENT_PIP_REF,
  LEGACY_REF,
  FORMER_MEMBER_REF,
  formSubmissionRef,
  resolveMemberRef,
  snapshotForWrite,
} from '@/lib/orgMembers/memberRef'

const ORG_ID = 'org-test'
const UID = 'uid-real'

function mockMemberDoc(exists: boolean, data: Record<string, unknown> = {}) {
  const getFn = jest.fn().mockResolvedValue({
    exists,
    data: () => (exists ? data : undefined),
  })
  const docFn = jest.fn().mockReturnValue({ get: getFn })
  ;(adminDb.collection as jest.Mock).mockReturnValue({ doc: docFn })
  return { getFn, docFn }
}

describe('AGENT_PIP_REF', () => {
  it('is the synthetic Pip actor with kind=agent', () => {
    expect(AGENT_PIP_REF).toEqual({
      uid: 'agent:pip',
      displayName: 'Pip',
      jobTitle: 'AI Agent',
      kind: 'agent',
    })
  })
})

describe('LEGACY_REF', () => {
  it('represents pre-rewire records', () => {
    expect(LEGACY_REF.uid).toBe('system:legacy')
    expect(LEGACY_REF.kind).toBe('system')
    expect(LEGACY_REF.displayName).toBe('Imported')
  })
})

describe('FORMER_MEMBER_REF', () => {
  it('builds a former-member ref from a uid', () => {
    expect(FORMER_MEMBER_REF('uid-x')).toEqual({
      uid: 'uid-x',
      displayName: 'Former member',
      kind: 'system',
    })
  })
})

describe('formSubmissionRef', () => {
  it('builds a form-submission ref scoped to formId', () => {
    expect(formSubmissionRef('form-123', 'Newsletter Signup')).toEqual({
      uid: 'system:form-submission:form-123',
      displayName: 'Newsletter Signup',
      kind: 'system',
    })
  })
})

describe('resolveMemberRef', () => {
  it('returns a real-member MemberRef when orgMembers doc exists', async () => {
    mockMemberDoc(true, {
      firstName: 'Peet',
      lastName: 'Stander',
      jobTitle: 'Founder',
      avatarUrl: 'https://x.test/a.jpg',
    })
    const ref = await resolveMemberRef(ORG_ID, UID)
    expect(ref).toEqual({
      uid: UID,
      displayName: 'Peet Stander',
      jobTitle: 'Founder',
      avatarUrl: 'https://x.test/a.jpg',
      kind: 'human',
    })
  })

  it('falls back to FORMER_MEMBER_REF when orgMembers doc is missing', async () => {
    mockMemberDoc(false)
    const ref = await resolveMemberRef(ORG_ID, UID)
    expect(ref).toEqual(FORMER_MEMBER_REF(UID))
  })

  it('handles missing firstName/lastName with uid fallback in displayName', async () => {
    mockMemberDoc(true, { jobTitle: 'Member' })
    const ref = await resolveMemberRef(ORG_ID, UID)
    expect(ref.displayName).toBe(UID)
    expect(ref.kind).toBe('human')
  })
})

describe('snapshotForWrite', () => {
  it('returns the same shape as resolveMemberRef when member exists', async () => {
    mockMemberDoc(true, { firstName: 'A', lastName: 'B' })
    const ref = await snapshotForWrite(ORG_ID, UID)
    expect(ref.displayName).toBe('A B')
    expect(ref.kind).toBe('human')
  })

  it('throws when member is missing (writes must have a real actor)', async () => {
    mockMemberDoc(false)
    await expect(snapshotForWrite(ORG_ID, UID)).rejects.toThrow(/not a member/i)
  })
})
