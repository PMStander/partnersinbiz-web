# Settings Panel & Workspace Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a settings side panel with user-account settings and per-workspace profile management, plus a role-gated team and permissions system — the foundation the CRM needs.

**Architecture:** Avatar click replaces the sidebar with a settings sub-nav; route detection in the portal layout drives the swap. A new `orgMembers/{orgId}_{uid}` flat collection stores per-workspace identity and role; a new `withPortalAuthAndRole(minRole)` middleware wraps role-sensitive routes. All settings routes live under `/api/v1/portal/settings/*`.

**Tech Stack:** Next.js 15 App Router, Firebase Admin SDK (Firestore), `withPortalAuth` from `lib/auth/portal-middleware.ts`, `OrgRole` from `lib/organizations/types.ts`, Tailwind CSS with existing PiB design tokens.

---

## File Map

### New files
| File | Purpose |
|---|---|
| `lib/orgMembers/types.ts` | `OrgMemberProfile` interface + `ROLE_RANK` helper |
| `app/api/v1/portal/settings/profile/route.ts` | GET/PATCH own workspace profile |
| `app/api/v1/portal/settings/team/route.ts` | GET all members for active org |
| `app/api/v1/portal/settings/team/invite/route.ts` | POST invite new member |
| `app/api/v1/portal/settings/team/[uid]/route.ts` | DELETE member from workspace |
| `app/api/v1/portal/settings/team/[uid]/role/route.ts` | PATCH member role (owner only) |
| `app/api/v1/portal/settings/permissions/route.ts` | GET/PATCH org permission toggles |
| `components/settings/SettingsNav.tsx` | Settings sub-nav (replaces sidebar nav when on settings routes) |
| `components/settings/MemberRow.tsx` | Member table row (avatar, name, title, role badge, actions) |
| `components/settings/ProfileCompleteBanner.tsx` | First-login profile prompt banner |
| `app/(portal)/portal/settings/layout.tsx` | Settings route layout — no-op wrapper (redirect handled in page) |
| `app/(portal)/portal/settings/account/page.tsx` | Account settings page |
| `app/(portal)/portal/settings/notifications/page.tsx` | Notifications page (move PushNotificationsToggle here) |
| `app/(portal)/portal/settings/workspaces/page.tsx` | My workspaces list + switcher |
| `app/(portal)/portal/settings/profile/page.tsx` | Workspace profile form |
| `app/(portal)/portal/settings/team/page.tsx` | Team management page |
| `app/(portal)/portal/settings/permissions/page.tsx` | Permissions toggles page |
| `__tests__/api/settings-profile.test.ts` | Tests for profile API |
| `__tests__/api/settings-team.test.ts` | Tests for team API |
| `__tests__/api/settings-permissions.test.ts` | Tests for permissions API |

### Modified files
| File | Change |
|---|---|
| `lib/auth/portal-middleware.ts` | Add `withPortalAuthAndRole(minRole, handler)` |
| `app/(portal)/layout.tsx` | Clickable avatar, settings sidebar mode, fetch workspace profile name |
| `app/(portal)/portal/settings/page.tsx` | Replace with redirect to `/portal/settings/account` |
| `app/(portal)/portal/dashboard/page.tsx` | Add `<ProfileCompleteBanner>` |

---

## Task 1: OrgMember types + `withPortalAuthAndRole` middleware

**Files:**
- Create: `lib/orgMembers/types.ts`
- Modify: `lib/auth/portal-middleware.ts`
- Create: `__tests__/api/settings-middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/settings-middleware.test.ts
import { NextRequest } from 'next/server'

const mockVerifySessionCookie = jest.fn()
const mockGet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifySessionCookie: mockVerifySessionCookie },
  adminDb: { collection: mockCollection },
}))

mockCollection.mockReturnValue({ doc: mockDoc })
mockDoc.mockReturnValue({ get: mockGet })

import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'

function makeReq() {
  return new NextRequest('http://localhost/test', {
    headers: { Cookie: '__session=valid-cookie' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerifySessionCookie.mockResolvedValue({ uid: 'uid-1' })
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('withPortalAuthAndRole', () => {
  it('returns 401 when no session cookie', async () => {
    const handler = withPortalAuthAndRole('admin', async () => new Response('ok', { status: 200 }))
    const req = new NextRequest('http://localhost/test')
    const res = await handler(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user has no workspace membership', async () => {
    // users doc
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      // orgMembers doc — not found
      .mockResolvedValueOnce({ exists: false })
      // organizations doc — no members array
      .mockResolvedValueOnce({ exists: true, data: () => ({ members: [] }) })

    const handler = withPortalAuthAndRole('member', async () => new Response('ok', { status: 200 }))
    const res = await handler(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns 403 when role is too low', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'viewer' }) })

    const handler = withPortalAuthAndRole('admin', async () => new Response('ok', { status: 200 }))
    const res = await handler(makeReq())
    expect(res.status).toBe(403)
  })

  it('calls handler with uid, orgId, role when role meets minimum', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'admin' }) })

    let captured: { uid: string; orgId: string; role: string } | null = null
    const handler = withPortalAuthAndRole('member', async (_req, uid, orgId, role) => {
      captured = { uid, orgId, role }
      return new Response('ok', { status: 200 })
    })
    const res = await handler(makeReq())
    expect(res.status).toBe(200)
    expect(captured).toEqual({ uid: 'uid-1', orgId: 'org-1', role: 'admin' })
  })

  it('falls back to organizations/members[] when orgMembers doc is missing', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      .mockResolvedValueOnce({ exists: false }) // no orgMembers doc
      .mockResolvedValueOnce({ exists: true, data: () => ({ members: [{ userId: 'uid-1', role: 'owner' }] }) })

    let capturedRole = ''
    const handler = withPortalAuthAndRole('admin', async (_req, _uid, _orgId, role) => {
      capturedRole = role
      return new Response('ok', { status: 200 })
    })
    const res = await handler(makeReq())
    expect(res.status).toBe(200)
    expect(capturedRole).toBe('owner')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-middleware.test.ts --no-coverage 2>&1 | tail -20
```
Expected: FAIL — `withPortalAuthAndRole` is not exported.

- [ ] **Step 3: Create `lib/orgMembers/types.ts`**

```typescript
// lib/orgMembers/types.ts
import type { OrgRole } from '@/lib/organizations/types'
import type { Timestamp } from 'firebase-admin/firestore'

export interface OrgMemberProfile {
  orgId: string
  uid: string
  firstName: string
  lastName: string
  jobTitle?: string
  phone?: string
  avatarUrl?: string
  role: OrgRole
  profileBannerDismissed?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type { OrgRole }

export const ROLE_RANK: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
}
```

- [ ] **Step 4: Add `withPortalAuthAndRole` to `lib/auth/portal-middleware.ts`**

Read the file first, then append after the existing `withPortalAuth` export:

```typescript
// --- add these imports at the top ---
import { adminDb } from '@/lib/firebase/admin'
import type { OrgRole } from '@/lib/organizations/types'
import { ROLE_RANK } from '@/lib/orgMembers/types'

// --- add after the existing withPortalAuth function ---

type PortalRoleHandler = (
  req: NextRequest,
  uid: string,
  orgId: string,
  role: OrgRole
) => Promise<Response>

export function withPortalAuthAndRole(minRole: OrgRole, handler: PortalRoleHandler) {
  return withPortalAuth(async (req: NextRequest, uid: string) => {
    const userDoc = await adminDb.collection('users').doc(uid).get()
    if (!userDoc.exists) return apiError('User not found', 404)
    const userData = userDoc.data()!
    const orgId: string = (userData.activeOrgId ?? userData.orgId ?? '') as string
    if (!orgId) return apiError('No active workspace', 400)

    let role: OrgRole | null = null
    const memberDoc = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
    if (memberDoc.exists) {
      role = memberDoc.data()!.role as OrgRole
    } else {
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
      if (orgDoc.exists) {
        const members: Array<{ userId: string; role: OrgRole }> = orgDoc.data()!.members ?? []
        const m = members.find((m) => m.userId === uid)
        if (m) role = m.role
      }
    }

    if (!role) return apiError('Workspace membership not found', 403)
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) return apiError('Insufficient permissions', 403)

    return handler(req, uid, orgId, role)
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-middleware.test.ts --no-coverage 2>&1 | tail -20
```
Expected: PASS — 5 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add lib/orgMembers/types.ts lib/auth/portal-middleware.ts __tests__/api/settings-middleware.test.ts
git commit -m "feat: add OrgMemberProfile type + withPortalAuthAndRole middleware"
```

---

## Task 2: Profile API (GET/PATCH own workspace profile)

**Files:**
- Create: `app/api/v1/portal/settings/profile/route.ts`
- Create: `__tests__/api/settings-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/settings-profile.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockSet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuth: (handler: Function) => (req: NextRequest) => handler(req, 'uid-1'),
}))
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockDoc.mockReturnValue({ get: mockGet, set: mockSet })
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('GET /api/v1/portal/settings/profile', () => {
  it('returns empty profile when no orgMembers doc exists', async () => {
    // users doc
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      // orgMembers doc
      .mockResolvedValueOnce({ exists: false })

    const { GET } = await import('@/app/api/v1/portal/settings/profile/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/profile', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toEqual({ firstName: '', lastName: '', jobTitle: '', phone: '', avatarUrl: '', role: null })
  })

  it('returns profile fields when doc exists', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ firstName: 'Peet', lastName: 'Stander', jobTitle: 'CEO', phone: '', avatarUrl: '', role: 'owner' }),
      })

    const { GET } = await import('@/app/api/v1/portal/settings/profile/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/profile', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(body.profile.firstName).toBe('Peet')
    expect(body.profile.role).toBe('owner')
  })
})

describe('PATCH /api/v1/portal/settings/profile', () => {
  it('upserts profile and returns updated fields', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
    mockSet.mockResolvedValue(undefined)

    const { PATCH } = await import('@/app/api/v1/portal/settings/profile/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/profile', {
      method: 'PATCH',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Peet', lastName: 'Stander', jobTitle: 'CEO' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Peet', lastName: 'Stander', jobTitle: 'CEO' }),
      { merge: true }
    )
  })

  it('returns 400 when firstName is missing', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })

    const { PATCH } = await import('@/app/api/v1/portal/settings/profile/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/profile', {
      method: 'PATCH',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastName: 'Stander' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-profile.test.ts --no-coverage 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the profile route**

```typescript
// app/api/v1/portal/settings/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

async function resolveOrgId(uid: string): Promise<string | null> {
  const userDoc = await adminDb.collection('users').doc(uid).get()
  if (!userDoc.exists) return null
  const d = userDoc.data()!
  return (d.activeOrgId ?? d.orgId ?? null) as string | null
}

export const GET = withPortalAuth(async (_req: NextRequest, uid: string) => {
  const orgId = await resolveOrgId(uid)
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const memberDoc = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
  if (!memberDoc.exists) {
    return NextResponse.json({
      profile: { firstName: '', lastName: '', jobTitle: '', phone: '', avatarUrl: '', role: null },
    })
  }

  const d = memberDoc.data()!
  return NextResponse.json({
    profile: {
      firstName: d.firstName ?? '',
      lastName: d.lastName ?? '',
      jobTitle: d.jobTitle ?? '',
      phone: d.phone ?? '',
      avatarUrl: d.avatarUrl ?? '',
      role: d.role ?? null,
    },
  })
})

export const PATCH = withPortalAuth(async (req: NextRequest, uid: string) => {
  const orgId = await resolveOrgId(uid)
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
  if (!firstName) return NextResponse.json({ error: 'firstName is required' }, { status: 400 })

  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : ''

  await adminDb
    .collection('orgMembers')
    .doc(`${orgId}_${uid}`)
    .set(
      {
        orgId,
        uid,
        firstName,
        lastName,
        jobTitle,
        phone,
        avatarUrl,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

  return NextResponse.json({ profile: { firstName, lastName, jobTitle, phone, avatarUrl } })
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-profile.test.ts --no-coverage 2>&1 | tail -20
```
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add app/api/v1/portal/settings/profile/route.ts __tests__/api/settings-profile.test.ts
git commit -m "feat: add GET/PATCH /api/v1/portal/settings/profile route"
```

---

## Task 3: Team API routes

**Files:**
- Create: `app/api/v1/portal/settings/team/route.ts`
- Create: `app/api/v1/portal/settings/team/invite/route.ts`
- Create: `app/api/v1/portal/settings/team/[uid]/route.ts`
- Create: `app/api/v1/portal/settings/team/[uid]/role/route.ts`
- Create: `__tests__/api/settings-team.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/settings-team.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockSet = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockDoc = jest.fn()
const mockWhere = jest.fn()
const mockCollection = jest.fn()
const mockBatch = jest.fn()
const mockBatchSet = jest.fn()
const mockBatchUpdate = jest.fn()
const mockBatchDelete = jest.fn()
const mockBatchCommit = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: mockCollection,
    batch: mockBatch,
  },
  adminAuth: {
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
    generatePasswordResetLink: jest.fn(),
  },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: Function) =>
    (req: NextRequest, ...args: any[]) => handler(req, 'uid-owner', 'org-1', 'owner', ...args),
}))
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS', arrayUnion: (v: any) => ({ type: 'arrayUnion', v }), arrayRemove: (v: any) => ({ type: 'arrayRemove', v }) },
}))

beforeEach(() => {
  jest.clearAllMocks()
  const batchObj = { set: mockBatchSet, update: mockBatchUpdate, delete: mockBatchDelete, commit: mockBatchCommit }
  mockBatch.mockReturnValue(batchObj)
  mockBatchCommit.mockResolvedValue(undefined)
  mockDoc.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate, delete: mockDelete })
  const queryObj = { where: mockWhere, get: mockGet }
  mockWhere.mockReturnValue(queryObj)
  mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere })
})

describe('GET /api/v1/portal/settings/team', () => {
  it('returns member profiles for the active org', async () => {
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'org-1_uid-1',
          data: () => ({ uid: 'uid-1', firstName: 'Peet', lastName: 'Stander', jobTitle: 'CEO', role: 'owner', avatarUrl: '' }),
        },
      ],
    })

    const { GET } = await import('@/app/api/v1/portal/settings/team/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/team', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toHaveLength(1)
    expect(body.members[0].firstName).toBe('Peet')
  })
})

describe('DELETE /api/v1/portal/settings/team/[uid]', () => {
  it('removes the member and returns success', async () => {
    // users doc for target
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ orgIds: ['org-1', 'org-2'], orgId: 'org-1', activeOrgId: 'org-1' }) })
    mockUpdate.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    mockBatchCommit.mockResolvedValue(undefined)

    const { DELETE } = await import('@/app/api/v1/portal/settings/team/[uid]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/team/uid-target', {
      method: 'DELETE',
      headers: { Cookie: '__session=valid' },
    })
    const res = await DELETE(req, { params: Promise.resolve({ uid: 'uid-target' }) })
    expect(res.status).toBe(200)
  })

  it('prevents removing self', async () => {
    const { DELETE } = await import('@/app/api/v1/portal/settings/team/[uid]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/team/uid-owner', {
      method: 'DELETE',
      headers: { Cookie: '__session=valid' },
    })
    const res = await DELETE(req, { params: Promise.resolve({ uid: 'uid-owner' }) })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/v1/portal/settings/team/[uid]/role', () => {
  it('updates the member role', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ members: [{ userId: 'uid-target', role: 'member' }] }) })
    mockSet.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockBatchCommit.mockResolvedValue(undefined)

    const { PATCH } = await import('@/app/api/v1/portal/settings/team/[uid]/role/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/team/uid-target/role', {
      method: 'PATCH',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ uid: 'uid-target' }) })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-team.test.ts --no-coverage 2>&1 | tail -20
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `app/api/v1/portal/settings/team/route.ts`**

```typescript
// app/api/v1/portal/settings/team/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

export const GET = withPortalAuthAndRole('viewer', async (_req: NextRequest, _uid: string, orgId: string) => {
  const snapshot = await adminDb
    .collection('orgMembers')
    .where('orgId', '==', orgId)
    .get()

  const members = snapshot.docs.map((d) => {
    const data = d.data()
    return {
      uid: data.uid as string,
      firstName: (data.firstName as string) ?? '',
      lastName: (data.lastName as string) ?? '',
      jobTitle: (data.jobTitle as string) ?? '',
      avatarUrl: (data.avatarUrl as string) ?? '',
      role: data.role as OrgRole,
    }
  })

  return NextResponse.json({ members })
})
```

- [ ] **Step 4: Create `app/api/v1/portal/settings/team/invite/route.ts`**

```typescript
// app/api/v1/portal/settings/team/invite/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb, adminAuth } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export const POST = withPortalAuthAndRole('admin', async (req: NextRequest, _uid: string, orgId: string) => {
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body.role === 'admin' ? 'admin' : 'member'

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  // Find or create Firebase Auth user
  let targetUid: string
  let isNew = false
  try {
    const existing = await adminAuth.getUserByEmail(email)
    targetUid = existing.uid
  } catch {
    // Create new user and send password reset so they set their own password
    const newUser = await adminAuth.createUser({ email })
    targetUid = newUser.uid
    isNew = true
  }

  // Add org to user's orgIds
  const userRef = adminDb.collection('users').doc(targetUid)
  const userDoc = await userRef.get()
  if (userDoc.exists) {
    await userRef.update({
      orgIds: FieldValue.arrayUnion(orgId),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    await userRef.set({
      uid: targetUid,
      email,
      role: 'client',
      orgId,
      orgIds: [orgId],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  // Add to org members array
  await adminDb.collection('organizations').doc(orgId).update({
    members: FieldValue.arrayUnion({ userId: targetUid, role, joinedAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Create minimal orgMembers doc (blank profile, role set)
  await adminDb
    .collection('orgMembers')
    .doc(`${orgId}_${targetUid}`)
    .set(
      {
        orgId,
        uid: targetUid,
        firstName: '',
        lastName: '',
        jobTitle: '',
        phone: '',
        avatarUrl: '',
        role,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

  // Send password reset email so new user can log in
  if (isNew) {
    await adminAuth.generatePasswordResetLink(email).catch(() => {})
  }

  return NextResponse.json({ uid: targetUid, isNew })
})
```

- [ ] **Step 5: Create `app/api/v1/portal/settings/team/[uid]/route.ts`**

```typescript
// app/api/v1/portal/settings/team/[uid]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

export const DELETE = withPortalAuthAndRole(
  'admin',
  async (_req: NextRequest, uid: string, orgId: string, _role: string, { params }: { params: Promise<{ uid: string }> }) => {
    const { uid: targetUid } = await params

    if (targetUid === uid) {
      return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 })
    }

    const batch = adminDb.batch()

    // Remove org from target user's orgIds
    const userRef = adminDb.collection('users').doc(targetUid)
    batch.update(userRef, {
      orgIds: FieldValue.arrayRemove(orgId),
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Remove from org members array
    const orgRef = adminDb.collection('organizations').doc(orgId)
    const orgDoc = await orgRef.get()
    if (orgDoc.exists) {
      const members: Array<{ userId: string; role: string }> = orgDoc.data()!.members ?? []
      const member = members.find((m) => m.userId === targetUid)
      if (member) {
        batch.update(orgRef, {
          members: FieldValue.arrayRemove(member),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    // Delete orgMembers profile doc
    batch.delete(adminDb.collection('orgMembers').doc(`${orgId}_${targetUid}`))

    await batch.commit()

    return NextResponse.json({ removed: targetUid })
  }
)
```

- [ ] **Step 6: Create `app/api/v1/portal/settings/team/[uid]/role/route.ts`**

```typescript
// app/api/v1/portal/settings/team/[uid]/role/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

const VALID_ROLES: OrgRole[] = ['admin', 'member', 'viewer']

export const PATCH = withPortalAuthAndRole(
  'owner',
  async (req: NextRequest, _uid: string, orgId: string, _role: OrgRole, { params }: { params: Promise<{ uid: string }> }) => {
    const { uid: targetUid } = await params
    const body = await req.json().catch(() => ({}))
    const newRole = body.role as OrgRole

    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: 'Invalid role. Allowed: admin, member, viewer' }, { status: 400 })
    }

    // Update orgMembers doc
    await adminDb
      .collection('orgMembers')
      .doc(`${orgId}_${targetUid}`)
      .set({ role: newRole, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

    // Update role in org members array
    const orgRef = adminDb.collection('organizations').doc(orgId)
    const orgDoc = await orgRef.get()
    if (orgDoc.exists) {
      const members: Array<{ userId: string; role: string }> = orgDoc.data()!.members ?? []
      const updated = members.map((m) => (m.userId === targetUid ? { ...m, role: newRole } : m))
      await orgRef.update({ members: updated, updatedAt: FieldValue.serverTimestamp() })
    }

    return NextResponse.json({ uid: targetUid, role: newRole })
  }
)
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-team.test.ts --no-coverage 2>&1 | tail -20
```
Expected: PASS — all tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add app/api/v1/portal/settings/team/ __tests__/api/settings-team.test.ts
git commit -m "feat: add team management API routes (list, invite, remove, role change)"
```

---

## Task 4: Permissions API

**Files:**
- Create: `app/api/v1/portal/settings/permissions/route.ts`
- Create: `__tests__/api/settings-permissions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/settings-permissions.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: Function) =>
    (req: NextRequest, ...args: any[]) => handler(req, 'uid-1', 'org-1', 'owner', ...args),
}))
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('GET /api/v1/portal/settings/permissions', () => {
  it('returns default permissions when no settings doc', async () => {
    mockGet.mockResolvedValue({ exists: false })

    const { GET } = await import('@/app/api/v1/portal/settings/permissions/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/permissions', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.permissions).toEqual({
      membersCanDeleteContacts: false,
      membersCanExportContacts: false,
      membersCanSendCampaigns: true,
    })
  })

  it('returns stored permissions when doc has settings', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        settings: {
          permissions: { membersCanDeleteContacts: true, membersCanExportContacts: false, membersCanSendCampaigns: true },
        },
      }),
    })

    const { GET } = await import('@/app/api/v1/portal/settings/permissions/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/permissions', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(body.permissions.membersCanDeleteContacts).toBe(true)
  })
})

describe('PATCH /api/v1/portal/settings/permissions', () => {
  it('updates permissions and returns updated values', async () => {
    mockUpdate.mockResolvedValue(undefined)

    const { PATCH } = await import('@/app/api/v1/portal/settings/permissions/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/permissions', {
      method: 'PATCH',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ membersCanDeleteContacts: true }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ 'settings.permissions.membersCanDeleteContacts': true })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-permissions.test.ts --no-coverage 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the permissions route**

```typescript
// app/api/v1/portal/settings/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const DEFAULTS = {
  membersCanDeleteContacts: false,
  membersCanExportContacts: false,
  membersCanSendCampaigns: true,
}

export const GET = withPortalAuthAndRole('owner', async (_req: NextRequest, _uid: string, orgId: string) => {
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  const stored = orgDoc.exists ? (orgDoc.data()!.settings?.permissions ?? {}) : {}
  return NextResponse.json({
    permissions: { ...DEFAULTS, ...stored },
  })
})

export const PATCH = withPortalAuthAndRole('owner', async (req: NextRequest, _uid: string, orgId: string) => {
  const body = await req.json().catch(() => ({}))

  const updates: Record<string, boolean | unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (typeof body.membersCanDeleteContacts === 'boolean') {
    updates['settings.permissions.membersCanDeleteContacts'] = body.membersCanDeleteContacts
  }
  if (typeof body.membersCanExportContacts === 'boolean') {
    updates['settings.permissions.membersCanExportContacts'] = body.membersCanExportContacts
  }
  if (typeof body.membersCanSendCampaigns === 'boolean') {
    updates['settings.permissions.membersCanSendCampaigns'] = body.membersCanSendCampaigns
  }

  await adminDb.collection('organizations').doc(orgId).update(updates)

  // Return the full current state
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  const stored = orgDoc.exists ? (orgDoc.data()!.settings?.permissions ?? {}) : {}
  return NextResponse.json({ permissions: { ...DEFAULTS, ...stored } })
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-permissions.test.ts --no-coverage 2>&1 | tail -20
```
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add app/api/v1/portal/settings/permissions/route.ts __tests__/api/settings-permissions.test.ts
git commit -m "feat: add GET/PATCH /api/v1/portal/settings/permissions route"
```

---

## Task 5: SettingsNav component + portal layout integration

**Files:**
- Create: `components/settings/SettingsNav.tsx`
- Modify: `app/(portal)/layout.tsx`

- [ ] **Step 1: Create `components/settings/SettingsNav.tsx`**

```tsx
// components/settings/SettingsNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SettingsNavProps {
  name: string
  email: string
  initials: string
  role: string | null
  collapsed: boolean
}

const ACCOUNT_LINKS = [
  { href: '/portal/settings/account', label: 'Account settings', icon: 'manage_accounts' },
  { href: '/portal/settings/notifications', label: 'Notifications', icon: 'notifications' },
  { href: '/portal/settings/workspaces', label: 'My workspaces', icon: 'workspaces' },
]

const WORKSPACE_LINKS = [
  { href: '/portal/settings/profile', label: 'My profile', icon: 'person', minRole: null },
  { href: '/portal/settings/team', label: 'Team', icon: 'group', minRole: 'admin' },
  { href: '/portal/settings/permissions', label: 'Permissions', icon: 'shield', minRole: 'owner' },
]

function canSee(linkMinRole: string | null, userRole: string | null): boolean {
  if (!linkMinRole) return true
  if (!userRole) return false
  const rank: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }
  return (rank[userRole] ?? 0) >= (rank[linkMinRole] ?? 0)
}

export function SettingsNav({ name, email, initials, role, collapsed }: SettingsNavProps) {
  const pathname = usePathname()

  if (collapsed) {
    return (
      <nav className="flex-1 flex flex-col items-center gap-1 py-4 px-2">
        <Link
          href="/portal/dashboard"
          title="Back to portal"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.05] transition-colors mb-2"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </Link>
        {[...ACCOUNT_LINKS, ...WORKSPACE_LINKS.filter((l) => canSee(l.minRole, role))].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={link.label}
            className={[
              'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
              pathname === link.href || pathname.startsWith(link.href + '/')
                ? 'bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-accent-hover)]'
                : 'text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.04]',
            ].join(' ')}
          >
            <span className="material-symbols-outlined text-[18px]">{link.icon}</span>
          </Link>
        ))}
      </nav>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-pib-line)]">
        <Link
          href="/portal/dashboard"
          className="flex items-center gap-2 text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors mb-4"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to portal
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-sm font-medium text-[var(--color-pib-accent-hover)] shrink-0">
            {initials || '·'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{name || 'Client'}</p>
            <p className="text-[11px] text-[var(--color-pib-text-muted)] truncate">{email}</p>
          </div>
        </div>
      </div>

      {/* Account section */}
      <nav className="px-3 py-4 space-y-4">
        <div className="space-y-0.5">
          <p className="eyebrow !text-[10px] px-3 mb-2">Account</p>
          {ACCOUNT_LINKS.map((link) => {
            const on = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  on
                    ? 'bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-accent-hover)]'
                    : 'text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.04]',
                ].join(' ')}
              >
                <span className={['material-symbols-outlined text-[18px] shrink-0', on ? 'text-[var(--color-pib-accent)]' : 'opacity-70'].join(' ')}>
                  {link.icon}
                </span>
                <span className="font-medium flex-1">{link.label}</span>
              </Link>
            )
          })}
        </div>

        {/* Workspace section */}
        <div className="space-y-0.5">
          <p className="eyebrow !text-[10px] px-3 mb-2">Workspace</p>
          {WORKSPACE_LINKS.filter((l) => canSee(l.minRole, role)).map((link) => {
            const on = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  on
                    ? 'bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-accent-hover)]'
                    : 'text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.04]',
                ].join(' ')}
              >
                <span className={['material-symbols-outlined text-[18px] shrink-0', on ? 'text-[var(--color-pib-accent)]' : 'opacity-70'].join(' ')}>
                  {link.icon}
                </span>
                <span className="font-medium flex-1">{link.label}</span>
                {link.minRole === 'admin' && (
                  <span className="text-[9px] bg-[var(--color-pib-line-strong)] text-[var(--color-pib-text-muted)] px-1.5 py-0.5 rounded-full">
                    {link.minRole}
                  </span>
                )}
                {link.minRole === 'owner' && (
                  <span className="text-[9px] bg-[var(--color-pib-line-strong)] text-[var(--color-pib-text-muted)] px-1.5 py-0.5 rounded-full">
                    owner
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: Modify `app/(portal)/layout.tsx` — add settings mode + clickable avatar + profile name fetch**

Read the file first, then make these three changes:

**Change A — Add imports and new state** (after the existing state declarations around line 122):

Old:
```tsx
  const [orgs, setOrgs] = useState<{ id: string; name: string; logoUrl: string }[]>([])
  const [activeOrgId, setActiveOrgId] = useState('')
  const [orgSwitching, setOrgSwitching] = useState(false)
```

New:
```tsx
  const [orgs, setOrgs] = useState<{ id: string; name: string; logoUrl: string }[]>([])
  const [activeOrgId, setActiveOrgId] = useState('')
  const [orgSwitching, setOrgSwitching] = useState(false)
  const [memberRole, setMemberRole] = useState<string | null>(null)
  const [profileName, setProfileName] = useState('')
```

Also add the import at the top of the file:
```tsx
import { SettingsNav } from '@/components/settings/SettingsNav'
```

**Change B — Fetch workspace profile after auth** (inside the `onAuthStateChanged` success block, after the `/api/v1/portal/orgs` fetch):

Old:
```tsx
          fetch('/api/v1/portal/orgs')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (Array.isArray(d?.orgs)) setOrgs(d.orgs)
              if (d?.activeOrgId) setActiveOrgId(d.activeOrgId)
            })
            .catch(() => {})
```

New:
```tsx
          fetch('/api/v1/portal/orgs')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (Array.isArray(d?.orgs)) setOrgs(d.orgs)
              if (d?.activeOrgId) setActiveOrgId(d.activeOrgId)
            })
            .catch(() => {})
          fetch('/api/v1/portal/settings/profile')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.profile?.firstName) {
                setProfileName(`${d.profile.firstName} ${d.profile.lastName}`.trim())
              }
              if (d?.profile?.role) setMemberRole(d.profile.role)
            })
            .catch(() => {})
```

**Change C — Use `profileName` in sidebar display name + make avatar clickable**

In the sidebar user chip (collapsed mode, around line 526), change the static avatar div to a clickable button:

Old (collapsed user chip avatar):
```tsx
              <div className="w-8 h-8 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-xs font-medium text-[var(--color-pib-accent-hover)]">
                {initials || '·'}
              </div>
```

New:
```tsx
              <Link
                href="/portal/settings/account"
                title="Settings"
                className="w-8 h-8 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-xs font-medium text-[var(--color-pib-accent-hover)] hover:ring-2 hover:ring-[var(--color-pib-accent)]/40 transition-all"
              >
                {initials || '·'}
              </Link>
```

Old (expanded user chip, around line 535):
```tsx
              <div className="w-8 h-8 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-xs font-medium text-[var(--color-pib-accent-hover)] shrink-0">
                {initials || '·'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{name || 'Client'}</p>
```

New:
```tsx
              <Link
                href="/portal/settings/account"
                title="Settings"
                className="w-8 h-8 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-xs font-medium text-[var(--color-pib-accent-hover)] hover:ring-2 hover:ring-[var(--color-pib-accent)]/40 transition-all shrink-0"
              >
                {initials || '·'}
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{profileName || name || 'Client'}</p>
```

**Change D — Replace sidebar nav with SettingsNav when on settings routes**

Replace the nav groups section in sidebar mode. Old (around line 453):

```tsx
        {/* Nav groups */}
        <nav className={['flex-1 overflow-y-auto py-4', collapsed ? 'px-2 space-y-1' : 'px-3 space-y-5'].join(' ')}>
          {collapsed
            ? navWithBadges.map(item => <NavLink key={item.href} item={item} pathname={pathname} collapsed />)
            : grouped.map(({ group, items }) => (
                <div key={group} className="space-y-1">
                  <p className="eyebrow !text-[10px] px-3 mb-2">{GROUP_LABELS[group]}</p>
                  {items.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
                </div>
              ))
          }
        </nav>
```

New:
```tsx
        {/* Nav — settings mode replaces normal nav */}
        {pathname.startsWith('/portal/settings') ? (
          <SettingsNav
            name={profileName || name}
            email={email}
            initials={initials}
            role={memberRole}
            collapsed={collapsed}
          />
        ) : (
          <nav className={['flex-1 overflow-y-auto py-4', collapsed ? 'px-2 space-y-1' : 'px-3 space-y-5'].join(' ')}>
            {collapsed
              ? navWithBadges.map(item => <NavLink key={item.href} item={item} pathname={pathname} collapsed />)
              : grouped.map(({ group, items }) => (
                  <div key={group} className="space-y-1">
                    <p className="eyebrow !text-[10px] px-3 mb-2">{GROUP_LABELS[group]}</p>
                    {items.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
                  </div>
                ))
            }
          </nav>
        )}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add components/settings/SettingsNav.tsx app/\(portal\)/layout.tsx
git commit -m "feat: add SettingsNav component + settings sidebar mode in portal layout"
```

---

## Task 6: Settings layout + account, notifications, workspaces pages

**Files:**
- Create: `app/(portal)/portal/settings/layout.tsx`
- Modify: `app/(portal)/portal/settings/page.tsx` (redirect)
- Create: `app/(portal)/portal/settings/account/page.tsx`
- Create: `app/(portal)/portal/settings/notifications/page.tsx`
- Create: `app/(portal)/portal/settings/workspaces/page.tsx`

- [ ] **Step 1: Create `app/(portal)/portal/settings/layout.tsx`**

This is a pass-through layout that ensures settings routes share the same portal shell:

```tsx
// app/(portal)/portal/settings/layout.tsx
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 2: Replace `app/(portal)/portal/settings/page.tsx` with a redirect**

```tsx
// app/(portal)/portal/settings/page.tsx
import { redirect } from 'next/navigation'

export default function SettingsRedirect() {
  redirect('/portal/settings/account')
}
```

- [ ] **Step 3: Create `app/(portal)/portal/settings/account/page.tsx`**

```tsx
// app/(portal)/portal/settings/account/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { getClientAuth } from '@/lib/firebase/config'

export default function AccountSettingsPage() {
  const auth = getClientAuth()
  const user = auth.currentUser
  const email = user?.email ?? ''

  const [resetting, setResetting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handlePasswordReset() {
    if (!email || resetting) return
    setResetting(true)
    setResetError('')
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSent(true)
    } catch {
      setResetError('Failed to send reset email. Try again.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">Account settings</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">Your login credentials — not workspace-specific.</p>

      <div className="space-y-4">
        <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1">Login email</p>
          <p className="text-sm">{email || '—'}</p>
          <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">Read-only. Managed by your account provider.</p>
        </div>

        <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1">Password</p>
          {resetSent ? (
            <p className="text-sm text-[var(--color-pib-accent)]">Password reset email sent to {email}.</p>
          ) : (
            <>
              <button
                onClick={handlePasswordReset}
                disabled={resetting}
                className="text-sm text-[var(--color-pib-accent)] hover:underline disabled:opacity-50 transition-opacity"
              >
                {resetting ? 'Sending…' : 'Send password reset email →'}
              </button>
              {resetError && <p className="text-xs text-red-400 mt-1">{resetError}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/(portal)/portal/settings/notifications/page.tsx`**

```tsx
// app/(portal)/portal/settings/notifications/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { PushNotificationsToggle } from '@/components/pwa/PushNotificationsToggle'

export default function NotificationsPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">Notifications</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">Control how Partners in Biz notifies you.</p>

      <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
        <p className="text-sm font-medium mb-3">Push notifications</p>
        <PushNotificationsToggle />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/(portal)/portal/settings/workspaces/page.tsx`**

```tsx
// app/(portal)/portal/settings/workspaces/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

interface OrgItem {
  id: string
  name: string
  logoUrl: string
}

export default function WorkspacesPage() {
  const [orgs, setOrgs] = useState<OrgItem[]>([])
  const [activeOrgId, setActiveOrgId] = useState('')
  const [switching, setSwitching] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/portal/orgs')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (Array.isArray(d?.orgs)) setOrgs(d.orgs)
        if (d?.activeOrgId) setActiveOrgId(d.activeOrgId)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSwitch(orgId: string) {
    if (orgId === activeOrgId || switching) return
    setSwitching(orgId)
    await fetch('/api/v1/portal/active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    setActiveOrgId(orgId)
    setSwitching('')
  }

  if (loading) return <div className="text-sm text-[var(--color-pib-text-muted)]">Loading…</div>

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">My workspaces</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">All workspaces your account is linked to.</p>

      <div className="space-y-2">
        {orgs.map(org => (
          <div
            key={org.id}
            className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl px-5 py-4 flex items-center gap-4"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--color-pib-accent-soft)] flex items-center justify-center text-sm font-bold text-[var(--color-pib-accent-hover)] shrink-0">
              {org.name[0]?.toUpperCase() ?? '·'}
            </div>
            <span className="flex-1 text-sm font-medium">{org.name}</span>
            {org.id === activeOrgId ? (
              <span className="text-xs text-[var(--color-pib-accent)] flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Active
              </span>
            ) : (
              <button
                onClick={() => handleSwitch(org.id)}
                disabled={!!switching}
                className="text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] disabled:opacity-50 transition-colors"
              >
                {switching === org.id ? 'Switching…' : 'Switch →'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add app/\(portal\)/portal/settings/
git commit -m "feat: add settings layout + account, notifications, workspaces pages"
```

---

## Task 7: My profile page (workspace profile form)

**Files:**
- Create: `app/(portal)/portal/settings/profile/page.tsx`

- [ ] **Step 1: Create `app/(portal)/portal/settings/profile/page.tsx`**

```tsx
// app/(portal)/portal/settings/profile/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

interface ProfileData {
  firstName: string
  lastName: string
  jobTitle: string
  phone: string
  avatarUrl: string
  role: string | null
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>({
    firstName: '', lastName: '', jobTitle: '', phone: '', avatarUrl: '', role: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/portal/settings/profile')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.profile) setProfile(d.profile) })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const res = await fetch('/api/v1/portal/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to save. Try again.')
    }
    setSaving(false)
  }

  function field(key: keyof ProfileData, label: string, required = false) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-pib-text-muted)]">
          {label}{required && ' *'}
        </label>
        <input
          type="text"
          value={(profile[key] as string) ?? ''}
          onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
          required={required}
          className="input-base text-sm"
        />
      </div>
    )
  }

  if (loading) return <div className="text-sm text-[var(--color-pib-text-muted)]">Loading…</div>

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">My profile</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">
        Your identity in this workspace. Used on CRM records, comments, and activity.
      </p>

      {profile.role && (
        <div className="mb-6 flex items-center gap-2">
          <span className="text-xs text-[var(--color-pib-text-muted)]">Workspace role:</span>
          <span className="pill !text-[11px] !py-0.5 !px-2 capitalize">{profile.role}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field('firstName', 'First name', true)}
            {field('lastName', 'Last name', true)}
          </div>
          {field('jobTitle', 'Job title')}
          {field('phone', 'Work phone')}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full sm:w-auto"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add app/\(portal\)/portal/settings/profile/page.tsx
git commit -m "feat: add workspace profile form page"
```

---

## Task 8: Team page + MemberRow component

**Files:**
- Create: `components/settings/MemberRow.tsx`
- Create: `app/(portal)/portal/settings/team/page.tsx`

- [ ] **Step 1: Create `components/settings/MemberRow.tsx`**

```tsx
// components/settings/MemberRow.tsx
'use client'

import type { OrgRole } from '@/lib/organizations/types'

interface MemberRowProps {
  uid: string
  firstName: string
  lastName: string
  jobTitle: string
  avatarUrl: string
  role: OrgRole
  viewerRole: OrgRole
  isSelf: boolean
  onRemove: (uid: string) => void
  onRoleChange: (uid: string, newRole: OrgRole) => void
}

const ROLE_COLORS: Record<OrgRole, string> = {
  owner: 'text-amber-400 bg-amber-400/10',
  admin: 'text-blue-400 bg-blue-400/10',
  member: 'text-violet-400 bg-violet-400/10',
  viewer: 'text-[var(--color-pib-text-muted)] bg-[var(--color-pib-line-strong)]',
}

const ROLE_RANK: Record<OrgRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }

export function MemberRow({ uid, firstName, lastName, jobTitle, avatarUrl, role, viewerRole, isSelf, onRemove, onRoleChange }: MemberRowProps) {
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || uid
  const initials = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || '?'
  const canRemove = !isSelf && ROLE_RANK[viewerRole] >= 3 && role !== 'owner'
  const canChangeRole = !isSelf && viewerRole === 'owner' && role !== 'owner'

  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-[var(--color-pib-line)] last:border-0">
      <div className="w-9 h-9 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-sm font-medium text-[var(--color-pib-accent-hover)] shrink-0 overflow-hidden">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        {jobTitle && <p className="text-xs text-[var(--color-pib-text-muted)] truncate">{jobTitle}</p>}
      </div>

      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[role]}`}>
        {role}
      </span>

      {canChangeRole && (
        <select
          value={role}
          onChange={e => onRoleChange(uid, e.target.value as OrgRole)}
          className="text-xs bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-lg px-2 py-1 text-[var(--color-pib-text-muted)] cursor-pointer"
          aria-label={`Change role for ${displayName}`}
        >
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      )}

      {canRemove && (
        <button
          onClick={() => onRemove(uid)}
          title={`Remove ${displayName}`}
          className="text-[var(--color-pib-text-muted)] hover:text-red-400 transition-colors p-1"
        >
          <span className="material-symbols-outlined text-[18px]">person_remove</span>
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(portal)/portal/settings/team/page.tsx`**

```tsx
// app/(portal)/portal/settings/team/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { MemberRow } from '@/components/settings/MemberRow'
import type { OrgRole } from '@/lib/organizations/types'

interface Member {
  uid: string
  firstName: string
  lastName: string
  jobTitle: string
  avatarUrl: string
  role: OrgRole
}

interface MyProfile {
  uid: string
  role: OrgRole | null
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [myProfile, setMyProfile] = useState<MyProfile>({ uid: '', role: null })
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/portal/settings/team').then(r => r.ok ? r.json() : null),
      fetch('/api/v1/portal/settings/profile').then(r => r.ok ? r.json() : null),
    ]).then(([teamData, profileData]) => {
      if (Array.isArray(teamData?.members)) setMembers(teamData.members)
      if (profileData?.profile) {
        setMyProfile({ uid: '', role: profileData.profile.role })
        // Get uid from auth — profile doesn't return uid, so we read it from a side fetch
        fetch('/api/v1/portal/active-org')
          .then(() => {}) // triggers session; uid retrieved elsewhere
          .catch(() => {})
      }
    }).finally(() => setLoading(false))
    // Get current uid
    fetch('/api/v1/portal/org')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user?.uid) setMyProfile(p => ({ ...p, uid: d.user.uid })) })
      .catch(() => {})
  }, [])

  async function handleRemove(uid: string) {
    if (!confirm('Remove this member from the workspace?')) return
    const res = await fetch(`/api/v1/portal/settings/team/${uid}`, { method: 'DELETE' })
    if (res.ok) setMembers(prev => prev.filter(m => m.uid !== uid))
  }

  async function handleRoleChange(uid: string, newRole: OrgRole) {
    const res = await fetch(`/api/v1/portal/settings/team/${uid}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(m => m.uid === uid ? { ...m, role: newRole } : m))
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    setInviteSent(false)
    const res = await fetch('/api/v1/portal/settings/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    if (res.ok) {
      setInviteEmail('')
      setInviteSent(true)
      // Refresh members list
      fetch('/api/v1/portal/settings/team').then(r => r.ok ? r.json() : null).then(d => {
        if (Array.isArray(d?.members)) setMembers(d.members)
      })
    } else {
      const body = await res.json().catch(() => ({}))
      setInviteError(body.error ?? 'Failed to invite. Try again.')
    }
    setInviting(false)
  }

  const viewerRole = myProfile.role ?? 'viewer'
  const canInvite = viewerRole === 'owner' || viewerRole === 'admin'

  if (loading) return <div className="text-sm text-[var(--color-pib-text-muted)]">Loading…</div>

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">Team</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">
        All members of this workspace.
      </p>

      <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl mb-6 overflow-hidden">
        {members.length === 0 ? (
          <p className="text-sm text-[var(--color-pib-text-muted)] px-5 py-6">No members found.</p>
        ) : (
          members.map(m => (
            <MemberRow
              key={m.uid}
              {...m}
              viewerRole={viewerRole as OrgRole}
              isSelf={m.uid === myProfile.uid}
              onRemove={handleRemove}
              onRoleChange={handleRoleChange}
            />
          ))
        )}
      </div>

      {canInvite && (
        <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Invite team member</h2>
          <form onSubmit={handleInvite} className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="input-base text-sm flex-1"
            />
            <button type="submit" disabled={inviting} className="btn-primary shrink-0">
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </form>
          {inviteSent && <p className="text-xs text-[var(--color-pib-accent)] mt-2">Invite sent.</p>}
          {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add components/settings/MemberRow.tsx app/\(portal\)/portal/settings/team/page.tsx
git commit -m "feat: add team page + MemberRow component"
```

---

## Task 9: Permissions page

**Files:**
- Create: `app/(portal)/portal/settings/permissions/page.tsx`

- [ ] **Step 1: Create `app/(portal)/portal/settings/permissions/page.tsx`**

```tsx
// app/(portal)/portal/settings/permissions/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

interface Permissions {
  membersCanDeleteContacts: boolean
  membersCanExportContacts: boolean
  membersCanSendCampaigns: boolean
}

const TOGGLES: { key: keyof Permissions; label: string; description: string }[] = [
  {
    key: 'membersCanDeleteContacts',
    label: 'Members can delete contacts',
    description: 'Allow members to permanently delete CRM contacts.',
  },
  {
    key: 'membersCanExportContacts',
    label: 'Members can export contacts',
    description: 'Allow members to export contact lists as CSV.',
  },
  {
    key: 'membersCanSendCampaigns',
    label: 'Members can create and send campaigns',
    description: 'Allow members to build and send marketing campaigns.',
  },
]

const FIXED_ROWS: { label: string; description: string }[] = [
  { label: 'Admins have full access (except changing roles)', description: 'Fixed — cannot be restricted.' },
  { label: 'Owners always have full access', description: 'Fixed — cannot be restricted.' },
  { label: 'Viewers are read-only', description: 'Fixed — viewers can never edit or delete.' },
]

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permissions>({
    membersCanDeleteContacts: false,
    membersCanExportContacts: false,
    membersCanSendCampaigns: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<keyof Permissions | null>(null)

  useEffect(() => {
    fetch('/api/v1/portal/settings/permissions')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.permissions) setPermissions(d.permissions) })
      .finally(() => setLoading(false))
  }, [])

  async function toggle(key: keyof Permissions) {
    const newValue = !permissions[key]
    setSaving(key)
    setPermissions(p => ({ ...p, [key]: newValue }))
    await fetch('/api/v1/portal/settings/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: newValue }),
    })
    setSaving(null)
  }

  if (loading) return <div className="text-sm text-[var(--color-pib-text-muted)]">Loading…</div>

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">Permissions</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">
        Control what members can do in this workspace.
      </p>

      <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-[var(--color-pib-line)]">
          <p className="text-xs font-semibold text-[var(--color-pib-text-muted)] uppercase tracking-widest">Member toggles</p>
        </div>
        {TOGGLES.map(t => (
          <div key={t.key} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--color-pib-line)] last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-[var(--color-pib-text-muted)]">{t.description}</p>
            </div>
            <button
              onClick={() => toggle(t.key)}
              disabled={saving === t.key}
              aria-label={`Toggle ${t.label}`}
              className={[
                'relative w-10 h-5 rounded-full transition-colors shrink-0',
                permissions[t.key] ? 'bg-[var(--color-pib-accent)]' : 'bg-[var(--color-pib-line-strong)]',
                saving === t.key ? 'opacity-60' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                  permissions[t.key] ? 'translate-x-5' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-pib-line)]">
          <p className="text-xs font-semibold text-[var(--color-pib-text-muted)] uppercase tracking-widest">Fixed behaviours</p>
        </div>
        {FIXED_ROWS.map(r => (
          <div key={r.label} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--color-pib-line)] last:border-0 opacity-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-[var(--color-pib-text-muted)]">{r.description}</p>
            </div>
            <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-text-muted)] shrink-0">lock</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add app/\(portal\)/portal/settings/permissions/page.tsx
git commit -m "feat: add permissions page with toggle UI"
```

---

## Task 10: First-login banner on dashboard

**Files:**
- Create: `components/settings/ProfileCompleteBanner.tsx`
- Modify: `app/(portal)/portal/dashboard/page.tsx`

- [ ] **Step 1: Create `components/settings/ProfileCompleteBanner.tsx`**

```tsx
// components/settings/ProfileCompleteBanner.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export function ProfileCompleteBanner() {
  const [show, setShow] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    fetch('/api/v1/portal/settings/profile')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.profile) return
        const { firstName, profileBannerDismissed } = d.profile
        if (!firstName && !profileBannerDismissed) setShow(true)
      })
      .catch(() => {})
  }, [])

  async function handleDismiss() {
    setDismissing(true)
    await fetch('/api/v1/portal/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: '', lastName: '', profileBannerDismissed: true }),
    }).catch(() => {})
    setShow(false)
    setDismissing(false)
  }

  if (!show) return null

  return (
    <div className="mb-6 flex items-start gap-4 bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-accent)]/20 rounded-xl px-5 py-4">
      <span className="material-symbols-outlined text-[20px] text-[var(--color-pib-accent)] mt-0.5 shrink-0">person</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Complete your workspace profile</p>
        <p className="text-xs text-[var(--color-pib-text-muted)] mt-0.5">
          Add your name and title so your team knows who you are.
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/portal/settings/profile" className="text-sm text-[var(--color-pib-accent)] hover:underline whitespace-nowrap">
          Set up profile →
        </Link>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors"
          aria-label="Dismiss"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update the profile API to support `profileBannerDismissed`**

In `app/api/v1/portal/settings/profile/route.ts`, the GET should return `profileBannerDismissed` and PATCH should accept it.

In the GET handler, add `profileBannerDismissed` to the returned profile object:

Old:
```typescript
  return NextResponse.json({
    profile: {
      firstName: d.firstName ?? '',
      lastName: d.lastName ?? '',
      jobTitle: d.jobTitle ?? '',
      phone: d.phone ?? '',
      avatarUrl: d.avatarUrl ?? '',
      role: d.role ?? null,
    },
  })
```

New:
```typescript
  return NextResponse.json({
    profile: {
      firstName: d.firstName ?? '',
      lastName: d.lastName ?? '',
      jobTitle: d.jobTitle ?? '',
      phone: d.phone ?? '',
      avatarUrl: d.avatarUrl ?? '',
      role: d.role ?? null,
      profileBannerDismissed: d.profileBannerDismissed ?? false,
    },
  })
```

In the PATCH handler, after the `avatarUrl` line, add:

```typescript
  const profileBannerDismissed = body.profileBannerDismissed === true

  await adminDb
    .collection('orgMembers')
    .doc(`${orgId}_${uid}`)
    .set(
      {
        orgId,
        uid,
        firstName,
        lastName,
        jobTitle,
        phone,
        avatarUrl,
        ...(profileBannerDismissed ? { profileBannerDismissed: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
```

Note: The PATCH still requires `firstName` to be present for a full profile save, but for dismiss-only calls the banner sends `firstName: ''` — so relax the validation to allow empty firstName when `profileBannerDismissed: true`:

```typescript
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
  const profileBannerDismissed = body.profileBannerDismissed === true
  if (!firstName && !profileBannerDismissed) {
    return NextResponse.json({ error: 'firstName is required' }, { status: 400 })
  }
```

- [ ] **Step 3: Add `<ProfileCompleteBanner>` to the dashboard page**

In `app/(portal)/portal/dashboard/page.tsx`, find the return statement and add the banner before the existing content. Read the file first to find the exact JSX return point.

The banner should be the first element in the main content area, before any existing components. Add this import at the top:

```tsx
import { ProfileCompleteBanner } from '@/components/settings/ProfileCompleteBanner'
```

Then inside the JSX return, as the first child of the outermost container div, add:

```tsx
<ProfileCompleteBanner />
```

- [ ] **Step 4: Commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add components/settings/ProfileCompleteBanner.tsx \
  app/\(portal\)/portal/settings/profile/route.ts \
  app/\(portal\)/portal/dashboard/page.tsx
git commit -m "feat: add first-login profile complete banner on dashboard"
```

---

## Task 11: Retire old settings page + final wiring

**Files:**
- Verify: `app/(portal)/portal/settings/page.tsx` is the redirect (done in Task 6)
- Run the full test suite to confirm nothing is broken

- [ ] **Step 1: Verify the settings redirect is in place**

```bash
cat /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web/app/\(portal\)/portal/settings/page.tsx
```
Expected: file contains `redirect('/portal/settings/account')` and nothing else.

- [ ] **Step 2: Run all settings-related tests**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest __tests__/api/settings-middleware.test.ts __tests__/api/settings-profile.test.ts __tests__/api/settings-team.test.ts __tests__/api/settings-permissions.test.ts --no-coverage 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
npx jest --no-coverage 2>&1 | tail -30
```
Expected: same pass count as before this feature, plus the 4 new test files.

- [ ] **Step 4: Final commit**

```bash
cd /Users/peetstander/Cowork/Partners\ in\ Biz\ —\ Client\ Growth/partnersinbiz-web
git add -A
git commit -m "feat: settings panel + workspace profiles — all tasks complete"
```

---

## Spec Coverage Checklist

| Spec requirement | Covered by task |
|---|---|
| Avatar click → settings panel | Task 5 (clickable avatar + settings sidebar mode) |
| Settings sub-nav with back button | Task 5 (SettingsNav component) |
| Account settings (email read-only, password reset) | Task 6 |
| Notifications page (move push toggle) | Task 6 |
| My workspaces page (list + switcher) | Task 6 |
| Workspace profile form (name, title, phone) | Task 7 |
| `orgMembers/{orgId}_{uid}` collection | Tasks 1, 2, 3 |
| `GET/PATCH /api/v1/portal/settings/profile` | Task 2 |
| Team page (list, invite, remove, role change) | Tasks 3, 8 |
| `GET /api/v1/portal/settings/team` | Task 3 |
| `POST /api/v1/portal/settings/team/invite` | Task 3 |
| `DELETE /api/v1/portal/settings/team/{uid}` | Task 3 |
| `PATCH /api/v1/portal/settings/team/{uid}/role` | Task 3 |
| Permissions toggles (3 toggles, owner only) | Tasks 4, 9 |
| `GET/PATCH /api/v1/portal/settings/permissions` | Task 4 |
| `requireOrgRole` middleware | Task 1 |
| Role-based nav visibility (Team = admin+, Permissions = owner) | Task 5 (SettingsNav) |
| First-login banner with dismiss | Task 10 |
| Portal layout uses workspace profile name | Task 5 |
| Old settings page retired + redirect | Task 6, 11 |
| Fixed behaviours documented in Permissions UI | Task 9 |
