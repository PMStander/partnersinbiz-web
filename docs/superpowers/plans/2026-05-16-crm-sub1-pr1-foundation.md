# CRM Sub-1 PR 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundational pieces of CRM Sub-1 (Tenant Safety + Identity Rewire) with **zero behaviour change** in production: new `withCrmAuth` middleware, `MemberRef` identity helpers, `Attribution` type extensions, a backfill script, and 4 new Firestore indexes. No existing route handlers touched.

**Architecture:** A new auth middleware `withCrmAuth(minRole, handler)` lives in `lib/auth/crm-middleware.ts` and accepts both `__session` cookie (resolves real `OrgMemberProfile` from `orgMembers/{orgId}_{uid}` with fallback to `organizations.members[]`) and `Authorization: Bearer <AI_API_KEY>` (resolves to synthetic `AGENT_PIP_REF` with role `'system'` which sits above `'owner'` in `ROLE_RANK`). The middleware pre-loads `org.settings.permissions` so route handlers can branch on permission toggles uniformly. Identity helpers in `lib/orgMembers/memberRef.ts` produce `MemberRef` snapshots that CRM routes embed in every write (`createdByRef`, `updatedByRef`, `assignedToRef`, `ownerRef`).

**Tech Stack:** Next.js 16 (App Router) · TypeScript · firebase-admin (Firestore + Auth) · jest with `ts-jest` · `tsx` for scripts.

**Spec:** [`docs/superpowers/specs/2026-05-16-crm-sub1-tenant-safety-design.md`](../specs/2026-05-16-crm-sub1-tenant-safety-design.md)

**Working directory:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## File Structure

**New files (10):**

| Path | Responsibility |
|---|---|
| `lib/orgMembers/memberRef.ts` | `MemberRef` type + constants (`AGENT_PIP_REF`, `LEGACY_REF`, `FORMER_MEMBER_REF`) + helpers (`resolveMemberRef`, `snapshotForWrite`, `formSubmissionRef`) |
| `__tests__/orgMembers/memberRef.test.ts` | Unit tests for the helpers — Firestore mocked |
| `__tests__/helpers/crm.ts` | Shared test seed helpers: `seedOrgMember`, `seedContact`, `seedDeal`, `seedActivity`, `callAsMember`, `callAsAgent`. Used by PR 1 middleware tests and every subsequent PR's isolation tests |
| `lib/auth/crm-middleware.ts` | `withCrmAuth(minRole, handler)` — dual auth (cookie + Bearer), role gate, `CrmAuthContext` builder |
| `__tests__/auth/crm-middleware.test.ts` | Middleware test suite — cookie path, Bearer path, missing `X-Org-Id`, missing member doc, fallback to `organizations.members[]`, role rank enforcement, agent bypass, permissions pre-load |
| `lib/crm/displayCreatedBy.ts` | Pure helper `displayCreatedBy(record): MemberRef` — returns `record.createdByRef` if present, else `LEGACY_REF`. UI code imports this instead of accessing the field directly |
| `__tests__/crm/displayCreatedBy.test.ts` | Unit tests for the helper |
| `scripts/crm-backfill-attribution.ts` | One-shot backfill — adds `createdByRef`/`updatedByRef` to legacy records across `contacts`, `deals`, `activities`, `segments`, `capture_sources`, `quotes`, `forms`, `form_submissions`. `--dry-run` by default, CSV output |
| `__tests__/scripts/crm-backfill-attribution.test.ts` | Unit tests for the backfill's per-record logic (Firestore mocked, no real writes) |
| `scripts/crm-backfill-reports/.gitkeep` | Empty marker so the reports directory exists in git |

**Modified files (2):**

| Path | Change |
|---|---|
| `lib/crm/types.ts` | Add `Attribution` interface, extend `Contact`/`Deal`/`Activity`/`Segment`/`CaptureSource`/`Quote`/`Form`/`FormSubmission` to include attribution fields (all optional for PR 1) |
| `firestore.indexes.json` | Add 4 new composite indexes (`capture_sources`, `contacts assignedTo`, `deals ownerUid`, `activities createdBy`) |

**Constraint:** No file under `app/api/v1/` is touched. No existing route changes behaviour. This PR is purely additive.

---

## Tasks

### Task 1: MemberRef types, constants, and helpers

**Files:**
- Create: `lib/orgMembers/memberRef.ts`
- Test: `__tests__/orgMembers/memberRef.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `__tests__/orgMembers/memberRef.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/orgMembers/memberRef.test.ts -- --no-coverage`
Expected: FAIL — `Cannot find module '@/lib/orgMembers/memberRef'`.

- [ ] **Step 3: Implement `lib/orgMembers/memberRef.ts`**

Create `lib/orgMembers/memberRef.ts`:

```typescript
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

function buildHumanRef(uid: string, data: Record<string, unknown> | undefined): MemberRef {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/orgMembers/memberRef.test.ts -- --no-coverage`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
git add lib/orgMembers/memberRef.ts __tests__/orgMembers/memberRef.test.ts
git commit -m "feat(crm): add MemberRef types and resolvers for attribution snapshots"
```

---

### Task 2: Attribution type additions

**Files:**
- Modify: `lib/crm/types.ts`

This task is types-only — no behaviour, no tests. Compile check is the gate.

- [ ] **Step 1: Add `Attribution` interface and extend CRM types**

In `lib/crm/types.ts`, add this import near the top with the existing imports:

```typescript
import type { MemberRef } from '@/lib/orgMembers/memberRef'
```

Then add this interface block above the existing `Contact` definition:

```typescript
export interface Attribution {
  createdAt: Timestamp | null
  createdBy?: string
  createdByRef?: MemberRef
  updatedAt: Timestamp | null
  updatedBy?: string
  updatedByRef?: MemberRef
}
```

Then extend the existing CRM record interfaces. For each one below, add the listed fields immediately after the existing `id` and `orgId` fields (preserve existing fields in place; only add the new ones):

**`Contact`:** add
```typescript
  createdBy?: string
  createdByRef?: MemberRef
  updatedBy?: string
  updatedByRef?: MemberRef
  assignedToRef?: MemberRef
```
(Existing `assignedTo: string` stays — `assignedToRef` is its snapshot companion.)

**`Deal`:** add
```typescript
  createdBy?: string
  createdByRef?: MemberRef
  updatedBy?: string
  updatedByRef?: MemberRef
  ownerUid?: string
  ownerRef?: MemberRef
```

**`Activity`** (existing `createdBy: string` stays; add the rest):
```typescript
  createdByRef?: MemberRef
  updatedBy?: string
  updatedByRef?: MemberRef
```

**`Segment`, `CaptureSource`, `Quote`, `Form`, `FormSubmission`:** add the same five fields each:
```typescript
  createdBy?: string
  createdByRef?: MemberRef
  updatedBy?: string
  updatedByRef?: MemberRef
```

If any of `Segment`/`CaptureSource`/`Quote`/`Form`/`FormSubmission` are not currently defined in `lib/crm/types.ts`, leave a comment in your commit message naming which ones you skipped — those get covered when their PR (4-7) lands.

- [ ] **Step 2: Run typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: PASS (no new errors). If existing code already had errors unrelated to this change, capture them in the commit message but don't fix here.

- [ ] **Step 3: Run jest suite to confirm nothing regresses**

Run: `npx jest -- --no-coverage`
Expected: All previously-passing tests still pass (1129+ passing per last session log).

- [ ] **Step 4: Commit**

```bash
git add lib/crm/types.ts
git commit -m "feat(crm): add Attribution interface and extend CRM record types"
```

---

### Task 3: `displayCreatedBy` read-time fallback helper

**Files:**
- Create: `lib/crm/displayCreatedBy.ts`
- Test: `__tests__/crm/displayCreatedBy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/crm/displayCreatedBy.test.ts`:

```typescript
import { displayCreatedBy, displayUpdatedBy } from '@/lib/crm/displayCreatedBy'
import { LEGACY_REF } from '@/lib/orgMembers/memberRef'

describe('displayCreatedBy', () => {
  it('returns createdByRef when present', () => {
    const ref = { uid: 'u1', displayName: 'Alice', kind: 'human' as const }
    expect(displayCreatedBy({ createdByRef: ref })).toBe(ref)
  })

  it('returns LEGACY_REF when createdByRef is missing', () => {
    expect(displayCreatedBy({})).toEqual(LEGACY_REF)
  })

  it('returns LEGACY_REF when createdByRef is null', () => {
    expect(displayCreatedBy({ createdByRef: null as any })).toEqual(LEGACY_REF)
  })
})

describe('displayUpdatedBy', () => {
  it('returns updatedByRef when present', () => {
    const ref = { uid: 'u1', displayName: 'Alice', kind: 'human' as const }
    expect(displayUpdatedBy({ updatedByRef: ref })).toBe(ref)
  })

  it('falls back to createdByRef when updatedByRef missing', () => {
    const created = { uid: 'u1', displayName: 'Alice', kind: 'human' as const }
    expect(displayUpdatedBy({ createdByRef: created })).toBe(created)
  })

  it('falls back to LEGACY_REF when both missing', () => {
    expect(displayUpdatedBy({})).toEqual(LEGACY_REF)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/crm/displayCreatedBy.test.ts -- --no-coverage`
Expected: FAIL — `Cannot find module '@/lib/crm/displayCreatedBy'`.

- [ ] **Step 3: Implement `lib/crm/displayCreatedBy.ts`**

```typescript
import { LEGACY_REF, type MemberRef } from '@/lib/orgMembers/memberRef'

interface MaybeAttributed {
  createdByRef?: MemberRef | null
  updatedByRef?: MemberRef | null
}

export function displayCreatedBy(record: MaybeAttributed): MemberRef {
  return record.createdByRef ?? LEGACY_REF
}

export function displayUpdatedBy(record: MaybeAttributed): MemberRef {
  return record.updatedByRef ?? record.createdByRef ?? LEGACY_REF
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/crm/displayCreatedBy.test.ts -- --no-coverage`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crm/displayCreatedBy.ts __tests__/crm/displayCreatedBy.test.ts
git commit -m "feat(crm): add displayCreatedBy/displayUpdatedBy read-time fallbacks"
```

---

### Task 4: Shared CRM test helpers

**Files:**
- Create: `__tests__/helpers/crm.ts`

This task lays the rails every isolation test in PR 2-8 runs on. The helpers are not under test themselves (they're test infra), but the file must compile and the helpers must produce shapes consistent with `lib/crm/types.ts`.

- [ ] **Step 1: Write `__tests__/helpers/crm.ts`**

```typescript
/**
 * Shared seed helpers for CRM tenant-isolation tests.
 * Used by PR 1 middleware tests and every PR 2-8 isolation test.
 *
 * Firebase Admin is mocked at the consumer site — these helpers assume the
 * mock is in place and return plain objects matching the production shape.
 */
import { Timestamp } from 'firebase-admin/firestore'
import type { NextRequest } from 'next/server'
import type { OrgRole } from '@/lib/organizations/types'
import type { Contact, Deal, Activity } from '@/lib/crm/types'
import type { MemberRef } from '@/lib/orgMembers/memberRef'

export interface SeededMember {
  orgId: string
  uid: string
  role: OrgRole
  firstName: string
  lastName: string
  ref: MemberRef
}

export function seedOrgMember(
  orgId: string,
  uid: string,
  opts: { role: OrgRole; firstName?: string; lastName?: string } = { role: 'member' },
): SeededMember {
  const firstName = opts.firstName ?? 'Test'
  const lastName = opts.lastName ?? uid
  return {
    orgId,
    uid,
    role: opts.role,
    firstName,
    lastName,
    ref: { uid, displayName: `${firstName} ${lastName}`, kind: 'human' },
  }
}

export function seedContact(orgId: string, overrides: Partial<Contact> = {}): Contact {
  const now = Timestamp.now()
  return {
    id: overrides.id ?? `contact-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    capturedFromId: 'manual',
    name: 'Test Contact',
    email: 'test@example.com',
    phone: '',
    company: '',
    website: '',
    source: 'manual',
    type: 'lead',
    stage: 'new',
    tags: [],
    notes: '',
    assignedTo: '',
    subscribedAt: null,
    unsubscribedAt: null,
    bouncedAt: null,
    createdAt: now,
    updatedAt: now,
    lastContactedAt: null,
    ...overrides,
  } as Contact
}

export function seedDeal(orgId: string, overrides: Partial<Deal> = {}): Deal {
  const now = Timestamp.now()
  return {
    id: overrides.id ?? `deal-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    contactId: '',
    title: 'Test Deal',
    value: 0,
    currency: 'ZAR',
    stage: 'new',
    expectedCloseDate: null,
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Deal
}

export function seedActivity(orgId: string, contactId: string, overrides: Partial<Activity> = {}): Activity {
  const now = Timestamp.now()
  return {
    id: overrides.id ?? `activity-${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    contactId,
    type: 'note',
    body: '',
    createdBy: 'uid-unknown',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Activity
}

/** Builds a NextRequest authenticated as the given member via the session cookie path. */
export function callAsMember(
  m: SeededMember,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `__session=test-session-${m.uid}`,
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NextRequest } = require('next/server')
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: new Headers(headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as NextRequest
}

/** Builds a NextRequest authenticated as the synthetic agent via Bearer key. */
export function callAsAgent(
  orgId: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  apiKey = process.env.AI_API_KEY ?? 'test-ai-key',
): NextRequest {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    'x-org-id': orgId,
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NextRequest } = require('next/server')
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: new Headers(headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as NextRequest
}
```

- [ ] **Step 2: Run typecheck to confirm helpers compile**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add __tests__/helpers/crm.ts
git commit -m "test(crm): add shared seed helpers for tenant-isolation tests"
```

---

### Task 5: `withCrmAuth` middleware

**Files:**
- Create: `lib/auth/crm-middleware.ts`
- Test: `__tests__/auth/crm-middleware.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/auth/crm-middleware.test.ts`:

```typescript
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifySessionCookie: jest.fn(),
  },
  adminDb: {
    collection: jest.fn(),
  },
}))

import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'

const AI_API_KEY = 'test-ai-key-abc'
process.env.AI_API_KEY = AI_API_KEY
process.env.SESSION_COOKIE_NAME = '__session'

const ORG_ID = 'org-test'
const UID = 'uid-real'

function makeReq(headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest('http://localhost/api/v1/crm/contacts', {
    method,
    headers: new Headers(headers),
  })
}

function mockUserDoc(data: Record<string, unknown> | null) {
  return jest.fn().mockResolvedValue({
    exists: data !== null,
    data: () => data,
  })
}

function mockOrgMembersDoc(data: Record<string, unknown> | null) {
  return jest.fn().mockResolvedValue({
    exists: data !== null,
    data: () => data,
  })
}

function mockOrgDoc(data: Record<string, unknown> | null) {
  return jest.fn().mockResolvedValue({
    exists: data !== null,
    data: () => data,
  })
}

function setupCollections({
  user,
  member,
  org,
}: {
  user: Record<string, unknown> | null
  member: Record<string, unknown> | null
  org: Record<string, unknown> | null
}) {
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users') return { doc: jest.fn().mockReturnValue({ get: mockUserDoc(user) }) }
    if (name === 'orgMembers') return { doc: jest.fn().mockReturnValue({ get: mockOrgMembersDoc(member) }) }
    if (name === 'organizations') return { doc: jest.fn().mockReturnValue({ get: mockOrgDoc(org) }) }
    throw new Error(`Unexpected collection: ${name}`)
  })
}

describe('withCrmAuth — cookie path', () => {
  beforeEach(() => jest.clearAllMocks())

  it('200s for a member with sufficient role', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: UID })
    setupCollections({
      user: { activeOrgId: ORG_ID },
      member: { orgId: ORG_ID, uid: UID, role: 'member', firstName: 'A', lastName: 'B' },
      org: { settings: { permissions: { membersCanDeleteContacts: true } } },
    })
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const route = withCrmAuth('member', handler)
    const req = makeReq({ cookie: '__session=valid' })
    const res = await route(req)
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    const ctx = handler.mock.calls[0][1]
    expect(ctx.orgId).toBe(ORG_ID)
    expect(ctx.role).toBe('member')
    expect(ctx.isAgent).toBe(false)
    expect(ctx.actor.uid).toBe(UID)
    expect(ctx.actor.kind).toBe('human')
    expect(ctx.permissions.membersCanDeleteContacts).toBe(true)
  })

  it('403s when member role is below minRole', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: UID })
    setupCollections({
      user: { activeOrgId: ORG_ID },
      member: { orgId: ORG_ID, uid: UID, role: 'viewer', firstName: 'A', lastName: 'B' },
      org: { settings: { permissions: {} } },
    })
    const handler = jest.fn()
    const route = withCrmAuth('admin', handler)
    const res = await route(makeReq({ cookie: '__session=valid' }))
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('falls back to organizations.members[] when orgMembers doc is missing', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: UID })
    setupCollections({
      user: { activeOrgId: ORG_ID },
      member: null,
      org: {
        settings: { permissions: {} },
        members: [{ userId: UID, role: 'admin' }],
      },
    })
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const route = withCrmAuth('member', handler)
    const res = await route(makeReq({ cookie: '__session=valid' }))
    expect(res.status).toBe(200)
    const ctx = handler.mock.calls[0][1]
    expect(ctx.role).toBe('admin')
    expect(ctx.actor.uid).toBe(UID)
  })

  it('403s when user has no membership in active org', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: UID })
    setupCollections({
      user: { activeOrgId: ORG_ID },
      member: null,
      org: { settings: { permissions: {} }, members: [] },
    })
    const handler = jest.fn()
    const route = withCrmAuth('viewer', handler)
    const res = await route(makeReq({ cookie: '__session=valid' }))
    expect(res.status).toBe(403)
  })

  it('400s when user has no activeOrgId or orgId', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: UID })
    setupCollections({ user: {}, member: null, org: null })
    const route = withCrmAuth('viewer', jest.fn())
    const res = await route(makeReq({ cookie: '__session=valid' }))
    expect(res.status).toBe(400)
  })

  it('401s when session cookie verification fails', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockRejectedValue(new Error('invalid'))
    const route = withCrmAuth('viewer', jest.fn())
    const res = await route(makeReq({ cookie: '__session=bad' }))
    expect(res.status).toBe(401)
  })
})

describe('withCrmAuth — Bearer path', () => {
  beforeEach(() => jest.clearAllMocks())

  it('200s with system role for valid AI_API_KEY + X-Org-Id', async () => {
    setupCollections({
      user: null,
      member: null,
      org: { settings: { permissions: { membersCanDeleteContacts: false } } },
    })
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const route = withCrmAuth('admin', handler)
    const res = await route(
      makeReq({ authorization: `Bearer ${AI_API_KEY}`, 'x-org-id': ORG_ID }),
    )
    expect(res.status).toBe(200)
    const ctx = handler.mock.calls[0][1]
    expect(ctx.role).toBe('system')
    expect(ctx.isAgent).toBe(true)
    expect(ctx.orgId).toBe(ORG_ID)
    expect(ctx.actor.uid).toBe('agent:pip')
    expect(ctx.actor.kind).toBe('agent')
    expect(ctx.permissions.membersCanDeleteContacts).toBe(false)
  })

  it('bypasses every minRole including owner', async () => {
    setupCollections({ user: null, member: null, org: { settings: { permissions: {} } } })
    const handler = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const route = withCrmAuth('owner', handler)
    const res = await route(
      makeReq({ authorization: `Bearer ${AI_API_KEY}`, 'x-org-id': ORG_ID }),
    )
    expect(res.status).toBe(200)
  })

  it('400s on Bearer call missing X-Org-Id header', async () => {
    const route = withCrmAuth('viewer', jest.fn())
    const res = await route(makeReq({ authorization: `Bearer ${AI_API_KEY}` }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/X-Org-Id/i)
  })

  it('401s on Bearer call with wrong key', async () => {
    const route = withCrmAuth('viewer', jest.fn())
    const res = await route(
      makeReq({ authorization: 'Bearer wrong-key', 'x-org-id': ORG_ID }),
    )
    expect(res.status).toBe(401)
  })
})

describe('withCrmAuth — no auth at all', () => {
  it('401s when neither cookie nor Bearer is present', async () => {
    const route = withCrmAuth('viewer', jest.fn())
    const res = await route(makeReq({}))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/auth/crm-middleware.test.ts -- --no-coverage`
Expected: FAIL — `Cannot find module '@/lib/auth/crm-middleware'`.

- [ ] **Step 3: Implement `lib/auth/crm-middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { ROLE_RANK } from '@/lib/orgMembers/types'
import type { OrgRole } from '@/lib/organizations/types'
import { AGENT_PIP_REF, type MemberRef } from '@/lib/orgMembers/memberRef'

export type CrmRole = OrgRole | 'system'

const SYSTEM_RANK = 5
function rankOf(role: CrmRole): number {
  return role === 'system' ? SYSTEM_RANK : ROLE_RANK[role]
}

export interface OrgPermissions {
  membersCanDeleteContacts?: boolean
  membersCanExportContacts?: boolean
}

export interface CrmAuthContext {
  orgId: string
  actor: MemberRef
  role: CrmRole
  isAgent: boolean
  permissions: OrgPermissions
}

export type CrmRouteHandler = (req: NextRequest, ctx: CrmAuthContext) => Promise<Response>

function apiError(message: string, status: number): Response {
  return NextResponse.json({ success: false, error: message }, { status })
}

function buildHumanRef(uid: string, data: Record<string, unknown> | undefined): MemberRef {
  const firstName = (data?.firstName as string | undefined) ?? ''
  const lastName = (data?.lastName as string | undefined) ?? ''
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || uid
  const ref: MemberRef = { uid, displayName, kind: 'human' }
  if (data?.jobTitle) ref.jobTitle = data.jobTitle as string
  if (data?.avatarUrl) ref.avatarUrl = data.avatarUrl as string
  return ref
}

async function loadOrgPermissions(orgId: string): Promise<{ permissions: OrgPermissions; members: Array<{ userId: string; role: OrgRole }> | null }> {
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  if (!orgDoc.exists) return { permissions: {}, members: null }
  const data = orgDoc.data() ?? {}
  return {
    permissions: ((data.settings as Record<string, unknown> | undefined)?.permissions as OrgPermissions) ?? {},
    members: (data.members as Array<{ userId: string; role: OrgRole }> | undefined) ?? null,
  }
}

export function withCrmAuth(
  minRole: Exclude<CrmRole, 'system'>,
  handler: CrmRouteHandler,
) {
  return async (req: NextRequest, ...rest: unknown[]): Promise<Response> => {
    const authHeader = req.headers.get('authorization') ?? ''

    // Bearer path
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const aiKey = process.env.AI_API_KEY
      if (!aiKey || token !== aiKey) {
        return apiError('Invalid API key', 401)
      }
      const orgId = req.headers.get('x-org-id') ?? ''
      if (!orgId) {
        return apiError('Missing X-Org-Id header', 400)
      }
      const { permissions } = await loadOrgPermissions(orgId)
      const ctx: CrmAuthContext = {
        orgId,
        actor: AGENT_PIP_REF,
        role: 'system',
        isAgent: true,
        permissions,
      }
      return handler(req, ctx)
    }

    // Cookie path
    const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
    const cookie = req.cookies.get(cookieName)?.value
    if (!cookie) return apiError('Unauthorized', 401)

    let uid: string
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie)
      uid = decoded.uid
    } catch {
      return apiError('Invalid session', 401)
    }

    const userDoc = await adminDb.collection('users').doc(uid).get()
    if (!userDoc.exists) return apiError('User not found', 404)
    const userData = userDoc.data() ?? {}
    const orgId: string = ((userData.activeOrgId as string | undefined) ?? (userData.orgId as string | undefined) ?? '') as string
    if (!orgId) return apiError('No active workspace', 400)

    // Resolve role + actor — orgMembers first, fall back to organizations.members[]
    const memberSnap = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
    let role: OrgRole | null = null
    let actor: MemberRef | null = null
    if (memberSnap.exists) {
      const m = memberSnap.data() ?? {}
      role = (m.role as OrgRole) ?? null
      actor = buildHumanRef(uid, m)
    }

    const { permissions, members } = await loadOrgPermissions(orgId)

    if (!role) {
      const fallback = members?.find((m) => m.userId === uid)
      if (fallback) {
        role = fallback.role
        actor = { uid, displayName: uid, kind: 'human' }
      }
    }

    if (!role || !actor) return apiError('Workspace membership not found', 403)
    if (rankOf(role) < rankOf(minRole)) return apiError('Insufficient permissions', 403)

    const ctx: CrmAuthContext = { orgId, actor, role, isAgent: false, permissions }
    return handler(req, ctx)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/auth/crm-middleware.test.ts -- --no-coverage`
Expected: PASS (11 tests).

- [ ] **Step 5: Run full jest suite to confirm no regressions**

Run: `npx jest -- --no-coverage`
Expected: All previously-passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/crm-middleware.ts __tests__/auth/crm-middleware.test.ts
git commit -m "feat(auth): add withCrmAuth middleware (cookie + Bearer + role + permissions)"
```

---

### Task 6: Backfill script + unit tests

**Files:**
- Create: `scripts/crm-backfill-attribution.ts`
- Create: `scripts/crm-backfill-reports/.gitkeep`
- Test: `__tests__/scripts/crm-backfill-attribution.test.ts`

The script does two things: (a) iterate every doc in each target collection and decide what attribution to write, (b) emit a CSV report. The decision logic in (a) is the unit-testable surface — we extract it to a pure function `decideAttribution(record, orgId, lookupMember)` that takes the record + an injected member-lookup function, and returns the `Attribution` patch.

- [ ] **Step 1: Write the failing test**

Create `__tests__/scripts/crm-backfill-attribution.test.ts`:

```typescript
import { decideAttribution } from '@/scripts/crm-backfill-attribution'
import { LEGACY_REF, FORMER_MEMBER_REF } from '@/lib/orgMembers/memberRef'

const ORG = 'org-1'

const realLookup = async (orgId: string, uid: string) => ({
  uid,
  displayName: 'Real Member',
  kind: 'human' as const,
})

const missingLookup = async () => null

describe('decideAttribution', () => {
  it('skips when createdByRef already present', async () => {
    const patch = await decideAttribution(
      { createdByRef: { uid: 'u1', displayName: 'X', kind: 'human' } },
      ORG,
      realLookup,
    )
    expect(patch).toBeNull()
  })

  it('resolves createdByRef from real member when createdBy uid present', async () => {
    const patch = await decideAttribution({ createdBy: 'u1', createdAt: null }, ORG, realLookup)
    expect(patch?.createdByRef?.displayName).toBe('Real Member')
    expect(patch?.createdByRef?.kind).toBe('human')
  })

  it('uses FORMER_MEMBER_REF when uid present but member doc missing', async () => {
    const patch = await decideAttribution({ createdBy: 'u1' }, ORG, missingLookup)
    expect(patch?.createdByRef).toEqual(FORMER_MEMBER_REF('u1'))
  })

  it('uses LEGACY_REF when no createdBy uid at all', async () => {
    const patch = await decideAttribution({}, ORG, realLookup)
    expect(patch?.createdByRef).toEqual(LEGACY_REF)
  })

  it('resolves updatedByRef when updatedBy uid present', async () => {
    const patch = await decideAttribution(
      { createdBy: 'u1', updatedBy: 'u2' },
      ORG,
      realLookup,
    )
    expect(patch?.updatedByRef?.displayName).toBe('Real Member')
    expect(patch?.createdByRef?.displayName).toBe('Real Member')
  })

  it('copies createdByRef onto updatedByRef when no updatedBy uid', async () => {
    const patch = await decideAttribution({ createdBy: 'u1' }, ORG, realLookup)
    expect(patch?.updatedByRef).toEqual(patch?.createdByRef)
  })

  it('uses LEGACY_REF on both fields when record is fully bare', async () => {
    const patch = await decideAttribution({}, ORG, missingLookup)
    expect(patch?.createdByRef).toEqual(LEGACY_REF)
    expect(patch?.updatedByRef).toEqual(LEGACY_REF)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/scripts/crm-backfill-attribution.test.ts -- --no-coverage`
Expected: FAIL — `Cannot find module '@/scripts/crm-backfill-attribution'`.

- [ ] **Step 3: Implement `scripts/crm-backfill-attribution.ts`**

```typescript
#!/usr/bin/env tsx
/**
 * One-shot backfill: adds createdByRef / updatedByRef to legacy CRM records.
 *
 * Targets: contacts, deals, activities, segments, capture_sources, quotes,
 *          forms, form_submissions
 *
 * Idempotent: records that already have createdByRef are skipped.
 *
 * Usage:
 *   npx tsx scripts/crm-backfill-attribution.ts                 # dry-run
 *   npx tsx scripts/crm-backfill-attribution.ts --commit        # actually write
 *   npx tsx scripts/crm-backfill-attribution.ts --org-id foo    # one org only
 *   npx tsx scripts/crm-backfill-attribution.ts --collection contacts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import {
  LEGACY_REF,
  FORMER_MEMBER_REF,
  type MemberRef,
} from '@/lib/orgMembers/memberRef'

const COLLECTIONS = [
  'contacts',
  'deals',
  'activities',
  'segments',
  'capture_sources',
  'quotes',
  'forms',
  'form_submissions',
] as const

export type TargetCollection = (typeof COLLECTIONS)[number]

export interface AttributionPatch {
  createdByRef: MemberRef
  updatedByRef: MemberRef
}

export type MemberLookup = (orgId: string, uid: string) => Promise<MemberRef | null>

/**
 * Pure decision function — exported for unit tests. Given a record's current
 * shape + an injected lookup, return the patch to apply (or null to skip).
 */
export async function decideAttribution(
  record: { createdByRef?: unknown; createdBy?: string; updatedBy?: string },
  orgId: string,
  lookupMember: MemberLookup,
): Promise<AttributionPatch | null> {
  if (record.createdByRef) return null

  let createdByRef: MemberRef
  if (record.createdBy) {
    createdByRef = (await lookupMember(orgId, record.createdBy)) ?? FORMER_MEMBER_REF(record.createdBy)
  } else {
    createdByRef = LEGACY_REF
  }

  let updatedByRef: MemberRef
  if (record.updatedBy) {
    updatedByRef = (await lookupMember(orgId, record.updatedBy)) ?? FORMER_MEMBER_REF(record.updatedBy)
  } else {
    updatedByRef = createdByRef
  }

  return { createdByRef, updatedByRef }
}

// ---- CLI ----

interface CliFlags {
  dryRun: boolean
  orgId?: string
  collection?: TargetCollection
  batchSize: number
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: true, batchSize: 200 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--commit') flags.dryRun = false
    else if (a === '--dry-run') flags.dryRun = true
    else if (a === '--org-id') flags.orgId = argv[++i]
    else if (a === '--collection') flags.collection = argv[++i] as TargetCollection
    else if (a === '--batch-size') flags.batchSize = parseInt(argv[++i] ?? '200', 10)
  }
  return flags
}

interface CsvRow {
  collection: string
  orgId: string
  resolved_real_member: number
  resolved_former_member: number
  resolved_legacy: number
  skipped_already_present: number
}

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  loadEnv()

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin')
  if (admin.apps.length === 0) {
    const keyPath = resolve(process.cwd(), 'service-account.json')
    if (existsSync(keyPath)) {
      admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() })
    }
  }
  const db = admin.firestore() as FirebaseFirestore.Firestore

  const lookupCache = new Map<string, MemberRef | null>()
  const lookupMember: MemberLookup = async (orgId, uid) => {
    const key = `${orgId}_${uid}`
    if (lookupCache.has(key)) return lookupCache.get(key)!
    const snap = await db.collection('orgMembers').doc(key).get()
    if (!snap.exists) {
      lookupCache.set(key, null)
      return null
    }
    const data = snap.data() ?? {}
    const firstName = (data.firstName as string | undefined) ?? ''
    const lastName = (data.lastName as string | undefined) ?? ''
    const ref: MemberRef = {
      uid,
      displayName: [firstName, lastName].filter(Boolean).join(' ') || uid,
      kind: 'human',
    }
    if (data.jobTitle) ref.jobTitle = data.jobTitle as string
    if (data.avatarUrl) ref.avatarUrl = data.avatarUrl as string
    lookupCache.set(key, ref)
    return ref
  }

  const rows: CsvRow[] = []
  const targetCollections = flags.collection ? [flags.collection] : COLLECTIONS

  for (const coll of targetCollections) {
    let query: FirebaseFirestore.Query = db.collection(coll)
    if (flags.orgId) query = query.where('orgId', '==', flags.orgId)

    const counts = new Map<string, CsvRow>()
    const snap = await query.get()
    console.log(`[${coll}] scanning ${snap.size} docs (dry-run=${flags.dryRun})`)

    let batch = db.batch()
    let inBatch = 0

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>
      const orgId = (data.orgId as string | undefined) ?? '__unknown__'
      const row = counts.get(orgId) ?? {
        collection: coll,
        orgId,
        resolved_real_member: 0,
        resolved_former_member: 0,
        resolved_legacy: 0,
        skipped_already_present: 0,
      }

      const patch = await decideAttribution(data as Parameters<typeof decideAttribution>[0], orgId, lookupMember)
      if (!patch) {
        row.skipped_already_present++
      } else if (patch.createdByRef === LEGACY_REF) {
        row.resolved_legacy++
      } else if (patch.createdByRef.kind === 'human') {
        row.resolved_real_member++
      } else {
        row.resolved_former_member++
      }
      counts.set(orgId, row)

      if (patch && !flags.dryRun) {
        batch.update(doc.ref, patch as Record<string, unknown>)
        inBatch++
        if (inBatch >= flags.batchSize) {
          await batch.commit()
          batch = db.batch()
          inBatch = 0
        }
      }
    }
    if (!flags.dryRun && inBatch > 0) await batch.commit()
    rows.push(...counts.values())
  }

  // Write CSV report
  const reportDir = resolve(process.cwd(), 'scripts/crm-backfill-reports')
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
  const reportPath = resolve(reportDir, `${stamp}-${flags.dryRun ? 'dryrun' : 'commit'}.csv`)
  const header = 'collection,orgId,resolved_real_member,resolved_former_member,resolved_legacy,skipped_already_present\n'
  const body = rows
    .map((r) =>
      [r.collection, r.orgId, r.resolved_real_member, r.resolved_former_member, r.resolved_legacy, r.skipped_already_present].join(','),
    )
    .join('\n')
  writeFileSync(reportPath, header + body + '\n')
  console.log(`\nReport: ${reportPath}`)
  console.log(`Mode: ${flags.dryRun ? 'DRY-RUN (no writes)' : 'COMMITTED'}`)
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
if (require.main === module) main()
```

- [ ] **Step 4: Create the reports directory marker**

```bash
mkdir -p scripts/crm-backfill-reports
touch scripts/crm-backfill-reports/.gitkeep
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/scripts/crm-backfill-attribution.test.ts -- --no-coverage`
Expected: PASS (7 tests).

- [ ] **Step 6: Run typecheck on the script**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/crm-backfill-attribution.ts scripts/crm-backfill-reports/.gitkeep __tests__/scripts/crm-backfill-attribution.test.ts
git commit -m "feat(crm): add backfill script for createdByRef/updatedByRef attribution"
```

---

### Task 7: Firestore indexes

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Add 4 new composite indexes**

Open `firestore.indexes.json`. Locate the top-level `"indexes": [...]` array and append these four entries (preserve all existing entries; just add to the end of the array — JSON allows trailing commas to be replaced):

```json
{
  "collectionGroup": "capture_sources",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "orgId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "contacts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "orgId", "order": "ASCENDING" },
    { "fieldPath": "assignedTo", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "deals",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "orgId", "order": "ASCENDING" },
    { "fieldPath": "ownerUid", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "activities",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "orgId", "order": "ASCENDING" },
    { "fieldPath": "createdBy", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8'))" && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(crm): add composite indexes for capture_sources, my-contacts, my-deals, my-activities"
```

Note: the indexes deploy (`firebase deploy --only firestore:indexes`) is a Peet-action pending firebase re-auth — same blocker as Ads Phase 1. The JSON commit is enough for this PR.

---

### Task 8: Final verification

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx jest -- --no-coverage`
Expected: All previously-passing tests still pass, PLUS the 4 new suites green:
- `__tests__/orgMembers/memberRef.test.ts` (10 tests)
- `__tests__/crm/displayCreatedBy.test.ts` (6 tests)
- `__tests__/auth/crm-middleware.test.ts` (11 tests)
- `__tests__/scripts/crm-backfill-attribution.test.ts` (7 tests)

If any pre-existing test (the 10 unrelated failures noted in the 2026-05-16 session log) is among them, capture in the PR description but do NOT fix here.

- [ ] **Step 2: Run a production build**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: `✓ Compiled successfully`. No new errors. (Recall the tsc-vs-build gotcha — typecheck alone is not enough; the full build catches client/server bundling boundaries.)

- [ ] **Step 3: Confirm no route files were touched**

Run: `git diff --stat main -- app/api/v1/`
Expected: empty output (zero route files changed in this PR).

- [ ] **Step 4: Confirm new files map to plan exactly**

Run: `git diff --stat main -- lib/ scripts/ __tests__/ firestore.indexes.json`
Expected: exactly these paths show up:
- `lib/orgMembers/memberRef.ts` (new)
- `lib/auth/crm-middleware.ts` (new)
- `lib/crm/types.ts` (modified)
- `lib/crm/displayCreatedBy.ts` (new)
- `scripts/crm-backfill-attribution.ts` (new)
- `scripts/crm-backfill-reports/.gitkeep` (new)
- `__tests__/orgMembers/memberRef.test.ts` (new)
- `__tests__/helpers/crm.ts` (new)
- `__tests__/auth/crm-middleware.test.ts` (new)
- `__tests__/crm/displayCreatedBy.test.ts` (new)
- `__tests__/scripts/crm-backfill-attribution.test.ts` (new)
- `firestore.indexes.json` (modified)

- [ ] **Step 5: Backfill dry-run smoke (optional, requires Firebase creds)**

If `service-account.json` or `GOOGLE_APPLICATION_CREDENTIALS` is available:

Run: `npx tsx scripts/crm-backfill-attribution.ts --org-id pib-platform-owner`
Expected: writes a `scripts/crm-backfill-reports/<stamp>-dryrun.csv` with per-collection counts for the PiB owner org. No Firestore writes.

Inspect the CSV to confirm the counts look reasonable. If anything looks off (e.g. all rows resolve to `LEGACY_REF` when you expected some `real_member`), debug the lookup before running `--commit` in production.

- [ ] **Step 6: Push**

```bash
git push origin main
```

(Peet's workflow is push-to-main → Vercel auto-deploy. The push deploys the type changes + middleware + script. No behaviour changes in production.)

- [ ] **Step 7: Post-deploy production backfill (run by Peet, NOT by the agent)**

After the push lands and Vercel deploys:

1. `npx tsx scripts/crm-backfill-attribution.ts` (defaults to `--dry-run`)
2. Review `scripts/crm-backfill-reports/<stamp>-dryrun.csv` — sanity check counts.
3. `npx tsx scripts/crm-backfill-attribution.ts --commit`
4. Re-run dry-run to confirm zero pending changes.
5. Then PR 2 can begin.

---

## Ship Gate

PR 1 is shipped when:
- All 8 tasks above are committed and pushed to `main`.
- Full jest suite passes (no new failures vs the 10 pre-existing baseline).
- `npm run build` is clean.
- `git diff --stat main -- app/api/v1/` shows zero route changes (no behaviour change in prod).
- Backfill dry-run produces a sensible CSV against at least one real org.

Production backfill `--commit` is a separate manual step (Step 7 above) and is the gate before PR 2 lands.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| `withCrmAuth` middleware (Architecture 3.1) | Task 5 |
| `MemberRef` types & helpers (Architecture 3.2) | Task 1 |
| `Attribution` extension on CRM types (Architecture — Data model) | Task 2 |
| `displayCreatedBy` read-time fallback | Task 3 |
| Backfill script with `LEGACY_REF` / CSV reports | Task 6 |
| 4 new Firestore indexes | Task 7 |
| Cross-tenant test helpers (used by PR 2-8) | Task 4 |
| Middleware test coverage (cookie / Bearer / role / fallback) | Task 5 |
| Ship gate — middleware tests green, build clean, backfill CSV sensible | Task 8 |

All foundation-PR requirements from the spec covered.

---

## Next step

After PR 1 ships and the production backfill `--commit` runs, write the PR 2 (Contacts migration) plan. The same `writing-plans` skill produces it; it consumes the helpers from this PR (`withCrmAuth`, `snapshotForWrite`, `seedOrgMember`, `callAsMember`, `callAsAgent`).
