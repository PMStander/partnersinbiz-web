// __tests__/api/v1/crm/companies/_fixtures.ts
import type { Company } from '@/lib/companies/types'
import { Timestamp } from 'firebase-admin/firestore'

let uidCounter = 0
/** Returns distinct uids; avoids substring-collision bug from prior CRM PRs (uid-a vs uid-admin-a). */
export function uidFor(label: string): string {
  uidCounter++
  return `uid_${label}_${uidCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function buildCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: overrides.id ?? `co_${Math.random().toString(36).slice(2, 10)}`,
    orgId: 'org-a',
    name: 'ACME Corp',
    domain: 'acme.com',
    website: 'https://acme.com',
    industry: 'Software',
    size: '51-200',
    tier: 'mid-market',
    lifecycleStage: 'customer',
    tags: [],
    notes: '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides
  }
}

export function buildMemberDoc(role: 'owner' | 'admin' | 'member' | 'viewer', uid: string, orgId = 'org-a') {
  return {
    orgId,
    uid,
    firstName: role,
    lastName: 'Test',
    role,
    jobTitle: `${role} title`,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  }
}

export function buildOwnerMember(orgId = 'org-a') { return buildMemberDoc('owner', uidFor('owner'), orgId) }
export function buildAdminMember(orgId = 'org-a') { return buildMemberDoc('admin', uidFor('admin'), orgId) }
export function buildRegularMember(orgId = 'org-a') { return buildMemberDoc('member', uidFor('member'), orgId) }
export function buildViewerMember(orgId = 'org-a') { return buildMemberDoc('viewer', uidFor('viewer'), orgId) }
