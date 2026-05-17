# CRM Sub-1 PR 2 — Contacts Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 5 `/api/v1/crm/contacts/*` route files from `withAuth('client'|'admin') + resolveOrgScope` to the new `withCrmAuth(minRole)` middleware. Every write embeds `MemberRef` snapshots (`createdByRef`, `updatedByRef`, `assignedToRef`). DELETE enforces `permissions.membersCanDeleteContacts` for `member` role. Cross-tenant isolation tests added.

**Architecture:** Each route swaps `import { withAuth } from '@/lib/api/auth'` + `resolveOrgScope` for `import { withCrmAuth } from '@/lib/auth/crm-middleware'` + `snapshotForWrite`. The middleware returns `CrmAuthContext` with `orgId`, `actor: MemberRef`, `role`, `isAgent`, `permissions`. Route handlers spread `Attribution` patches into writes via the existing PR 1 helpers. Existing webhook dispatch + `logActivity` calls preserved (they already accept `user.uid` / `actorId`).

**Tech Stack:** Next.js 16 (App Router) · TypeScript · firebase-admin · jest with `ts-jest`.

**Spec:** [`docs/superpowers/specs/2026-05-16-crm-sub1-tenant-safety-design.md`](../specs/2026-05-16-crm-sub1-tenant-safety-design.md) (role matrix is the source of truth)

**Prerequisite:** PR 1 (Foundation) shipped at `2c92a30`. Production backfill recommended but not blocking — `displayCreatedBy` handles missing legacy `createdByRef` via `LEGACY_REF` fallback.

**Working directory:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## File Structure

**Modified files (5):**

| Path | Change |
|---|---|
| `app/api/v1/crm/contacts/route.ts` | GET → `withCrmAuth('viewer')`. POST → `withCrmAuth('member')` + write `createdByRef`/`updatedByRef`/`assignedToRef`. |
| `app/api/v1/crm/contacts/[id]/route.ts` | GET → `withCrmAuth('viewer')`. PATCH/PUT → `withCrmAuth('member')` + write `updatedByRef` + write `assignedToRef` when `assignedTo` changes. DELETE → `withCrmAuth('member')` + enforce `membersCanDeleteContacts` toggle for `member` role. |
| `app/api/v1/crm/contacts/[id]/tags/route.ts` | POST → `withCrmAuth('member')` (downgrade from `'admin'` per spec matrix). Replace ad-hoc `updatedBy`/`updatedByType` with `updatedByRef` snapshot. |
| `app/api/v1/crm/contacts/[id]/activities/route.ts` | GET → `withCrmAuth('viewer')` (downgrade from `'admin'` per matrix). No writes. |
| `app/api/v1/crm/contacts/import/route.ts` | POST → `withCrmAuth('member')` + write `createdByRef` per imported contact. |

**Modified test files (3):**

| Path | Change |
|---|---|
| `__tests__/api/v1/crm/contacts.test.ts` | Update mocks for `withCrmAuth` (cookie path + Bearer path). Existing assertions preserved. |
| `__tests__/api/v1/crm/contacts-id.test.ts` | Same auth-mock migration. Add DELETE-with-toggle-off test. |
| `__tests__/api/v1/crm/contacts-import.test.ts` | Same auth-mock migration. |

**New test files (1):**

| Path | Responsibility |
|---|---|
| `__tests__/api/v1/crm/contacts-tenant-isolation.test.ts` | Cross-tenant isolation suite using the `__tests__/helpers/crm.ts` helpers from PR 1. Covers all 5 routes: list, GET by id, PATCH, DELETE, tags, activities, import. Asserts member of org A cannot read/write org B data, Bearer key with `X-Org-Id: A` cannot see B, `createdByRef` populated on writes, DELETE toggle enforcement, agent bypass. |

**Constraint:** No `lib/*` file is modified. PR 1's middleware + helpers are the foundation; PR 2 only consumes them.

---

## Common Patterns

These patterns appear in every task. Quote them by reference (`see "Pattern X"`) rather than restating.

### Pattern A — Route file migration template

```typescript
// BEFORE
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'

export const GET = withAuth('client', async (req, user) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId
  // ... handler body uses orgId
})

// AFTER
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { snapshotForWrite } from '@/lib/orgMembers/memberRef'

export const GET = withCrmAuth('viewer', async (req, ctx) => {
  const orgId = ctx.orgId
  // ... handler body uses ctx.orgId, ctx.actor, ctx.role, ctx.permissions, ctx.isAgent
})
```

Remove the `resolveOrgScope` import + call. The `?orgId=` query param is now ignored (middleware authoritative). Update query-param parsing to drop `orgId` extraction.

### Pattern B — `createdByRef` on POST writes

```typescript
// Resolve the actor as a MemberRef. For cookie auth this is a real human;
// for Bearer (system) auth, ctx.actor is already AGENT_PIP_REF.
const actorRef = ctx.isAgent
  ? ctx.actor
  : await snapshotForWrite(ctx.orgId, ctx.actor.uid)

const contactData = {
  // ...existing fields...
  createdBy: ctx.isAgent ? undefined : ctx.actor.uid,  // omitted for agent
  createdByRef: actorRef,
  updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
  updatedByRef: actorRef,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}
// Strip undefined keys before write (Firestore rejects undefined values):
const sanitized = Object.fromEntries(Object.entries(contactData).filter(([, v]) => v !== undefined))
await adminDb.collection('contacts').doc(id).set(sanitized)
```

### Pattern C — `updatedByRef` on PATCH writes (with optional `assignedToRef`)

```typescript
const actorRef = ctx.isAgent
  ? ctx.actor
  : await snapshotForWrite(ctx.orgId, ctx.actor.uid)

const patch: Record<string, unknown> = {
  ...body,
  updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
  updatedByRef: actorRef,
  updatedAt: FieldValue.serverTimestamp(),
}

// If assignedTo changed AND it's a real human uid (not empty/null), snapshot it.
// resolveMemberRef is tolerant — returns FORMER_MEMBER_REF if member doc missing,
// so deleting members doesn't break the snapshot.
if (typeof body.assignedTo === 'string' && body.assignedTo !== '') {
  patch.assignedToRef = await resolveMemberRef(ctx.orgId, body.assignedTo)
}

const sanitized = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
await adminDb.collection('contacts').doc(id).update(sanitized)
```

Note: `assignedToRef` uses `resolveMemberRef` (tolerant), not `snapshotForWrite` (strict). The reviewer's PR 1 forward-looking concern: external-uid or ex-member assignments would 500 with `snapshotForWrite`.

### Pattern D — DELETE permission toggle

```typescript
export const DELETE = withCrmAuth('member', async (req, ctx) => {
  if (ctx.role === 'member' && !ctx.permissions.membersCanDeleteContacts) {
    return apiError('Members are not allowed to delete contacts in this workspace', 403)
  }
  // ... existing delete logic
})
```

`'system'` and `'owner'`/`'admin'` bypass the toggle. Only `'member'` is gated.

### Pattern E — Test mock for `withCrmAuth`

Existing tests mock `withAuth`. The new mock target is `withCrmAuth` + the modules it reads (`adminAuth.verifySessionCookie`, `adminDb.collection('users'|'orgMembers'|'organizations')`). Re-use the `__tests__/helpers/crm.ts` helpers wherever possible.

```typescript
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { seedOrgMember, callAsMember, callAsAgent } from '../../../helpers/crm'

const AI_API_KEY = 'test-ai-key-abc'
process.env.AI_API_KEY = AI_API_KEY

function mockMember(member: { uid: string; orgId: string; role: string; firstName?: string; lastName?: string }, orgSettings: Record<string, unknown> = {}) {
  ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: member.uid })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: member.orgId }) }) }) }
    if (name === 'orgMembers') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => member }) }) }
    if (name === 'organizations') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: orgSettings } }) }) }) }
    return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
  })
}
```

Wherever a test needs to mock the `contacts` collection too (the route reads/writes it), extend the `mockImplementation` switch with a `'contacts'` arm.

---

## Tasks

### Task 1: Migrate `/api/v1/crm/contacts/route.ts` (GET list + POST create)

**Files:**
- Modify: `app/api/v1/crm/contacts/route.ts`
- Modify: `__tests__/api/v1/crm/contacts.test.ts` (update auth mocks for `withCrmAuth`)

**Role matrix:** GET → `viewer`, POST → `member`. No toggle gates.

- [ ] **Step 1: Read the current route file**

Run: `cat app/api/v1/crm/contacts/route.ts` — confirm the current `withAuth` + `resolveOrgScope` pattern.

- [ ] **Step 2: Update the test file FIRST (TDD shape — but tests will reference the new middleware)**

Open `__tests__/api/v1/crm/contacts.test.ts`. Replace the auth mock setup at the top with Pattern E. Tests should now build the request via `callAsMember(member, 'GET', '/api/v1/crm/contacts')` from helpers. Keep all existing assertions.

Also add ONE new test:
```typescript
it('writes createdByRef snapshot on POST', async () => {
  const member = seedOrgMember('org-1', 'uid-1', { role: 'member', firstName: 'Alice', lastName: 'B' })
  mockMember(member)
  // ... mock the contacts collection write (capture the data passed to set)
  // ... call POST with body { name: 'X', email: 'x@y.com', source: 'manual' }
  // Assert: the captured doc data contains createdByRef.displayName === 'Alice B', kind === 'human'
})
```

- [ ] **Step 3: Run the test to verify it fails (current route still uses old auth)**

Run: `npx jest __tests__/api/v1/crm/contacts.test.ts --no-coverage`
Expected: FAILs because the route is still on `withAuth` which expects different mocks.

- [ ] **Step 4: Migrate the route**

Apply Pattern A. Then for POST, apply Pattern B. Preserve all existing field validation, webhook dispatch, and `logActivity` calls — only swap the auth and add attribution writes.

The `logActivity` call already accepts `actorId: user.uid` and `actorName: ...`. Update to use `ctx.actor.uid` and `ctx.actor.displayName` respectively. For Bearer/agent calls, `ctx.actor.displayName === 'Pip'`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/api/v1/crm/contacts.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web"
git add app/api/v1/crm/contacts/route.ts __tests__/api/v1/crm/contacts.test.ts
git commit -m "feat(crm): migrate contacts root route to withCrmAuth + MemberRef attribution"
```

---

### Task 2: Migrate `/api/v1/crm/contacts/[id]/route.ts` (GET + PATCH/PUT + DELETE)

**Files:**
- Modify: `app/api/v1/crm/contacts/[id]/route.ts`
- Modify: `__tests__/api/v1/crm/contacts-id.test.ts`

**Role matrix:** GET → `viewer`. PUT/PATCH → `member`. DELETE → `member` + `membersCanDeleteContacts` toggle.

- [ ] **Step 1: Read current route + test file**

Run: `cat app/api/v1/crm/contacts/[id]/route.ts __tests__/api/v1/crm/contacts-id.test.ts | head -100`

- [ ] **Step 2: Update test mocks + add new tests**

Apply Pattern E to the existing test file. The `[id]` route uses Next.js dynamic segments — tests must pass the `routeCtx` (`{ params: Promise<{ id: string }> }`) as the second arg to the route handler.

Update the route signature mocks accordingly:
```typescript
import { GET, PUT, PATCH, DELETE } from '@/app/api/v1/crm/contacts/[id]/route'

const req = callAsMember(member, 'PATCH', '/api/v1/crm/contacts/contact-1', { name: 'Updated' })
const routeCtx = { params: Promise.resolve({ id: 'contact-1' }) }
const res = await PATCH(req, routeCtx)
```

Add 3 new tests:
```typescript
it('writes updatedByRef on PATCH', async () => { /* assert patch.updatedByRef.displayName === 'Alice B' */ })
it('writes assignedToRef when assignedTo changes', async () => { /* PATCH with body { assignedTo: 'uid-2' }; assert assignedToRef populated */ })
it('blocks DELETE for member role when membersCanDeleteContacts is false', async () => {
  const member = seedOrgMember('org-1', 'uid-1', { role: 'member' })
  mockMember(member, { membersCanDeleteContacts: false })
  // ... mock contact read (orgId match)
  const res = await DELETE(callAsMember(member, 'DELETE', '/api/v1/crm/contacts/contact-1'), { params: Promise.resolve({ id: 'contact-1' }) })
  expect(res.status).toBe(403)
})

it('allows DELETE for member role when membersCanDeleteContacts is true', async () => { /* same, toggle true, expect 200 */ })

it('allows DELETE for admin role regardless of toggle', async () => { /* role: 'admin', toggle: false, expect 200 */ })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/api/v1/crm/contacts-id.test.ts --no-coverage`
Expected: FAIL.

- [ ] **Step 4: Migrate the route**

- GET: Pattern A with `withCrmAuth('viewer')`. The existing read-then-orgId-check (verify `contact.orgId === ctx.orgId`, else 404) stays — the middleware doesn't fetch the contact for you.
- PUT (and `PATCH = PUT`): Pattern A + Pattern C.
- DELETE: Pattern A + Pattern D. Existing logic (set `deleted: true`) preserved.

Note: the spec's role matrix has `assigned-changes` writing `assignedToRef` snapshot. Use Pattern C.

Replace the existing `dispatchWebhook(orgId, 'contact.updated', {...})` payload with `{...body, updatedByRef: actorRef}` so external webhooks can show the actor too. Webhook dispatch error handling (try/catch) preserved.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/api/v1/crm/contacts-id.test.ts --no-coverage`
Expected: PASS (all original + 5 new tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/crm/contacts/[id]/route.ts __tests__/api/v1/crm/contacts-id.test.ts
git commit -m "feat(crm): migrate contacts/[id] route to withCrmAuth + Attribution + DELETE toggle"
```

---

### Task 3: Migrate `/api/v1/crm/contacts/[id]/tags/route.ts` (POST tag operations)

**Files:**
- Modify: `app/api/v1/crm/contacts/[id]/tags/route.ts`
- Create: `__tests__/api/v1/crm/contacts-id-tags.test.ts` (no existing test file)

**Role matrix:** POST → `member` (downgrade from `'admin'`).

- [ ] **Step 1: Read current route**

Run: `cat app/api/v1/crm/contacts/[id]/tags/route.ts`

Confirm it uses `lastActorFrom(user)` to derive `updatedBy` + `updatedByType`. PR 2 replaces both fields with the `updatedByRef` snapshot (matches the rest of the codebase).

- [ ] **Step 2: Create the test file**

Create `__tests__/api/v1/crm/contacts-id-tags.test.ts` with these tests (use Pattern E setup):

```typescript
describe('POST /api/v1/crm/contacts/[id]/tags', () => {
  it('member can add tags to a contact in own org', async () => { /* expect 200, tags array updated, updatedByRef written */ })
  it('member cannot add tags to a contact in a different org', async () => { /* contact.orgId is org-2; expect 404 */ })
  it('agent (Bearer) can add tags', async () => { /* callAsAgent, expect 200, updatedByRef.kind === 'agent' */ })
  it('viewer cannot add tags (403)', async () => { /* role: 'viewer'; expect 403 */ })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/api/v1/crm/contacts-id-tags.test.ts --no-coverage`
Expected: FAIL.

- [ ] **Step 4: Migrate the route**

Apply Pattern A with `withCrmAuth('member')`. Remove the `lastActorFrom(user)` import — replace `updatedBy`/`updatedByType` writes with `updatedByRef = ctx.isAgent ? ctx.actor : await snapshotForWrite(ctx.orgId, ctx.actor.uid)` + the `updatedBy: ctx.actor.uid` (or omit for agent).

Preserve the `FieldValue.arrayUnion` / `arrayRemove` tag logic verbatim.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/api/v1/crm/contacts-id-tags.test.ts --no-coverage`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/crm/contacts/[id]/tags/route.ts __tests__/api/v1/crm/contacts-id-tags.test.ts
git commit -m "feat(crm): migrate contacts/[id]/tags to withCrmAuth + replace ad-hoc updatedBy with updatedByRef"
```

---

### Task 4: Migrate `/api/v1/crm/contacts/[id]/activities/route.ts` (GET activities)

**Files:**
- Modify: `app/api/v1/crm/contacts/[id]/activities/route.ts`
- Create: `__tests__/api/v1/crm/contacts-id-activities.test.ts`

**Role matrix:** GET → `viewer` (downgrade from `'admin'`). No writes.

- [ ] **Step 1: Read current route**

Run: `cat app/api/v1/crm/contacts/[id]/activities/route.ts`

- [ ] **Step 2: Create the test file**

Create `__tests__/api/v1/crm/contacts-id-activities.test.ts`:

```typescript
describe('GET /api/v1/crm/contacts/[id]/activities', () => {
  it('viewer can read activities for a contact in own org', async () => { /* expect 200, activities returned, all orgId match */ })
  it('viewer cannot read activities for a contact in another org', async () => { /* contact.orgId is org-2; expect 404 */ })
  it('agent (Bearer) can read activities', async () => { /* callAsAgent, expect 200 */ })
  it('returns empty list when contact has no activities (not an error)', async () => { /* expect 200, activities: [] */ })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/api/v1/crm/contacts-id-activities.test.ts --no-coverage`
Expected: FAIL.

- [ ] **Step 4: Migrate the route**

Pattern A with `withCrmAuth('viewer')`. The existing `where('orgId', '==', orgId).where('contactId', '==', id)` query stays — uses the existing `activities orgId+contactId+createdAt` composite index.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/api/v1/crm/contacts-id-activities.test.ts --no-coverage`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/crm/contacts/[id]/activities/route.ts __tests__/api/v1/crm/contacts-id-activities.test.ts
git commit -m "feat(crm): migrate contacts/[id]/activities to withCrmAuth('viewer')"
```

---

### Task 5: Migrate `/api/v1/crm/contacts/import/route.ts` (Bulk CSV/JSON import)

**Files:**
- Modify: `app/api/v1/crm/contacts/import/route.ts`
- Modify: `__tests__/api/v1/crm/contacts-import.test.ts`

**Role matrix:** POST → `member`.

- [ ] **Step 1: Read current route + test**

Run: `cat app/api/v1/crm/contacts/import/route.ts __tests__/api/v1/crm/contacts-import.test.ts | head -120`

- [ ] **Step 2: Update test mocks + add attribution test**

Apply Pattern E to the existing test file.

Add ONE new test:
```typescript
it('writes createdByRef on each imported contact', async () => {
  const member = seedOrgMember('org-1', 'uid-1', { role: 'member', firstName: 'Alice', lastName: 'B' })
  mockMember(member)
  // ... mock contacts batch writes (capture all set() calls)
  // ... call POST with body { contacts: [{name:'A',email:'a@y.com'}, {name:'B',email:'b@y.com'}] }
  // Assert: every captured set() call's data has createdByRef.displayName === 'Alice B'
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/api/v1/crm/contacts-import.test.ts --no-coverage`
Expected: FAIL.

- [ ] **Step 4: Migrate the route**

Pattern A with `withCrmAuth('member')`. For every batched contact create, apply Pattern B's field set. **Resolve `actorRef` ONCE at the top of the handler** (not per-contact) since it's the same for all contacts in this batch:

```typescript
const actorRef = ctx.isAgent ? ctx.actor : await snapshotForWrite(ctx.orgId, ctx.actor.uid)

for (const row of validContacts) {
  const docRef = adminDb.collection('contacts').doc()
  const data = {
    orgId: ctx.orgId,
    capturedFromId: '',
    name: row.name,
    email: row.email,
    // ... existing fields ...
    source: 'import',
    type: 'lead',
    stage: 'new',
    createdBy: ctx.isAgent ? undefined : ctx.actor.uid,
    createdByRef: actorRef,
    updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
    updatedByRef: actorRef,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  const sanitized = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  batch.set(docRef, sanitized)
}
```

Tag-merge update path preserved verbatim, except add `updatedByRef: actorRef` and `updatedBy: ctx.actor.uid` (or omit for agent).

The `capture_sources.capturedCount` counter bump is preserved verbatim.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/api/v1/crm/contacts-import.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/crm/contacts/import/route.ts __tests__/api/v1/crm/contacts-import.test.ts
git commit -m "feat(crm): migrate contacts/import to withCrmAuth + createdByRef per row"
```

---

### Task 6: Cross-tenant isolation suite

**Files:**
- Create: `__tests__/api/v1/crm/contacts-tenant-isolation.test.ts`

This single consolidated suite is the regression net for PR 2. It exercises every migrated route from the perspective of the spec's isolation requirements.

- [ ] **Step 1: Write the suite**

Create `__tests__/api/v1/crm/contacts-tenant-isolation.test.ts`:

```typescript
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { seedOrgMember, seedContact, callAsMember, callAsAgent } from '../../../helpers/crm'
import { GET as listGET, POST as listPOST } from '@/app/api/v1/crm/contacts/route'
import { GET as detailGET, PATCH as detailPATCH, DELETE as detailDELETE } from '@/app/api/v1/crm/contacts/[id]/route'
import { POST as tagsPOST } from '@/app/api/v1/crm/contacts/[id]/tags/route'
import { GET as activitiesGET } from '@/app/api/v1/crm/contacts/[id]/activities/route'
import { POST as importPOST } from '@/app/api/v1/crm/contacts/import/route'

const AI_API_KEY = 'test-ai-key'
process.env.AI_API_KEY = AI_API_KEY

const memberA = seedOrgMember('org-a', 'uid-a', { role: 'member', firstName: 'A', lastName: 'A' })
const memberB = seedOrgMember('org-b', 'uid-b', { role: 'member', firstName: 'B', lastName: 'B' })

// Seeded contacts: a1 in org-a, b1 in org-b
const contactA = seedContact('org-a', { id: 'a1' })
const contactB = seedContact('org-b', { id: 'b1' })

// Helper: stage Firestore mocks so that:
// - users/{uid-a} has activeOrgId=org-a; users/{uid-b} has activeOrgId=org-b
// - orgMembers docs match accordingly
// - organizations docs return permissions (overridable per test)
// - contacts/{a1} returns contactA; contacts/{b1} returns contactB
function setupIsolationFixtures(perms: Record<string, unknown> = { membersCanDeleteContacts: true }) {
  ;(adminAuth.verifySessionCookie as jest.Mock).mockImplementation((cookie: string) => {
    if (cookie.includes(memberA.uid)) return Promise.resolve({ uid: memberA.uid })
    if (cookie.includes(memberB.uid)) return Promise.resolve({ uid: memberB.uid })
    return Promise.reject(new Error('invalid'))
  })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users') return { doc: (uid: string) => ({ get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: uid === memberA.uid ? 'org-a' : 'org-b' }) }) }) }
    if (name === 'orgMembers') return { doc: (id: string) => ({ get: () => Promise.resolve({ exists: true, data: () => (id.startsWith('org-a') ? memberA : memberB) }) }) }
    if (name === 'organizations') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: perms } }) }) }) }
    if (name === 'contacts') {
      return {
        doc: (id: string) => ({
          get: () => Promise.resolve({ exists: id === 'a1' || id === 'b1', data: () => (id === 'a1' ? contactA : id === 'b1' ? contactB : undefined) }),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
        }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: () => Promise.resolve({ docs: [{ id: 'a1', data: () => contactA }, { id: 'b1', data: () => contactB }].filter(d => /* filter by previous where */ true) }),
        // For PR 2 simplicity, route handlers call where('orgId', '==', orgId) — the mock
        // returns the full set; tests below assert the response body only contains the org's own ids.
      }
    }
    if (name === 'activities') return { where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: () => Promise.resolve({ docs: [] }) }
    return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
  })
}

beforeEach(() => { jest.clearAllMocks(); setupIsolationFixtures() })

describe('cross-tenant isolation: contacts', () => {
  it('member of A cannot read org B contact by id (404)', async () => {
    const res = await detailGET(callAsMember(memberA, 'GET', '/api/v1/crm/contacts/b1'), { params: Promise.resolve({ id: 'b1' }) })
    expect(res.status).toBe(404)
  })

  it('member of A cannot PATCH org B contact (404)', async () => {
    const res = await detailPATCH(callAsMember(memberA, 'PATCH', '/api/v1/crm/contacts/b1', { name: 'Hacked' }), { params: Promise.resolve({ id: 'b1' }) })
    expect(res.status).toBe(404)
  })

  it('member of A cannot DELETE org B contact (404)', async () => {
    const res = await detailDELETE(callAsMember(memberA, 'DELETE', '/api/v1/crm/contacts/b1'), { params: Promise.resolve({ id: 'b1' }) })
    expect(res.status).toBe(404)
  })

  it('member of A cannot add tags to org B contact (404)', async () => {
    const res = await tagsPOST(callAsMember(memberA, 'POST', '/api/v1/crm/contacts/b1/tags', { add: ['x'] }), { params: Promise.resolve({ id: 'b1' }) })
    expect(res.status).toBe(404)
  })

  it('member of A cannot read activities for org B contact (404)', async () => {
    const res = await activitiesGET(callAsMember(memberA, 'GET', '/api/v1/crm/contacts/b1/activities'), { params: Promise.resolve({ id: 'b1' }) })
    expect(res.status).toBe(404)
  })

  it('Bearer with X-Org-Id=org-a cannot access org B contact (404)', async () => {
    const res = await detailGET(callAsAgent('org-a', 'GET', '/api/v1/crm/contacts/b1'), { params: Promise.resolve({ id: 'b1' }) })
    expect(res.status).toBe(404)
  })

  it('member of A POST creates contact in own org with createdByRef snapshot', async () => {
    const res = await listPOST(callAsMember(memberA, 'POST', '/api/v1/crm/contacts', { name: 'X', email: 'x@y.com', source: 'manual' }))
    expect(res.status).toBe(201)
    // Capture the set() call to assert createdByRef.displayName === 'A A'
    const setCall = (adminDb.collection('contacts').doc('any') as any).set as jest.Mock
    const writtenData = setCall.mock.calls[0]?.[0]
    expect(writtenData?.createdByRef?.displayName).toBe('A A')
    expect(writtenData?.createdByRef?.kind).toBe('human')
    expect(writtenData?.orgId).toBe('org-a')
  })

  it('Bearer (agent) POST creates contact with AGENT_PIP_REF', async () => {
    const res = await listPOST(callAsAgent('org-a', 'POST', '/api/v1/crm/contacts', { name: 'Y', email: 'y@y.com', source: 'manual' }))
    expect(res.status).toBe(201)
    const setCall = (adminDb.collection('contacts').doc('any') as any).set as jest.Mock
    const writtenData = setCall.mock.calls.at(-1)?.[0]
    expect(writtenData?.createdByRef?.uid).toBe('agent:pip')
    expect(writtenData?.createdByRef?.kind).toBe('agent')
  })

  it('member DELETE is blocked when membersCanDeleteContacts toggle is off', async () => {
    // Re-stage with toggle off — call setupIsolationFixtures({ membersCanDeleteContacts: false })
    // (refactor setupIsolationFixtures to accept a permissions overrides argument:
    //   function setupIsolationFixtures(perms: Record<string, unknown> = { membersCanDeleteContacts: true })
    //  and pass `perms` into the organizations doc data())
    setupIsolationFixtures({ membersCanDeleteContacts: false })
    const res = await detailDELETE(callAsMember(memberA, 'DELETE', '/api/v1/crm/contacts/a1'), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(403)
  })

  it('agent (Bearer) DELETE succeeds even when toggle is off', async () => { /* same as above but callAsAgent('org-a', 'DELETE', ...) — expect 200 */ })
})
```

This suite intentionally focuses on isolation + attribution + toggle. Per-route behavior tests already live in the route-specific test files updated in Tasks 1-5.

- [ ] **Step 2: Run the suite**

Run: `npx jest __tests__/api/v1/crm/contacts-tenant-isolation.test.ts --no-coverage`
Expected: PASS (10 tests).

If the mock builder pattern is unwieldy (the toggle-off test in particular), extract `setupIsolationFixtures(options)` to accept toggle state as a parameter rather than copy-pasting the mock implementation.

- [ ] **Step 3: Commit**

```bash
git add __tests__/api/v1/crm/contacts-tenant-isolation.test.ts
git commit -m "test(crm): add cross-tenant isolation suite for contacts routes (PR 2)"
```

---

### Task 7: Final verification + push

- [ ] **Step 1: Full jest suite**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx jest --no-coverage 2>&1 | tail -10`
Expected: all suites green. ~22-25 new tests (5 from Task 1 + 5 from Task 2 + 4 from Task 3 + 4 from Task 4 + 1 from Task 5 + 10 from Task 6).

- [ ] **Step 2: Production build**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | grep -E "(Compiled|error|failed)" | head -5`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Confirm only the expected route files changed**

Run: `git diff --stat 2c92a30 -- app/api/v1/crm/contacts/`
Expected: exactly 5 files modified (root, [id], [id]/tags, [id]/activities, import).

- [ ] **Step 4: Confirm no `lib/*` files touched in PR 2**

Run: `git diff --stat 2c92a30 -- lib/`
Expected: empty.

- [ ] **Step 5: Push**

```bash
git push origin main
```

- [ ] **Step 6: Update wiki**

Append the PR 2 ship summary to `~/Cowork/Cowork/agents/partners/wiki/hot.md` (or rewrite — coordinate with parallel agent's last hot.md edits).

---

## Ship Gate

PR 2 ships when:
- All 7 tasks above are committed and pushed.
- All previously-passing tests still pass + ~25-30 new tests added.
- `npm run build` clean.
- `git diff --stat <base> -- lib/` empty (no `lib/*` changes — pure route migration).
- Manual smoke (recommended): log into portal as a member, create a contact, verify `createdByRef` populated in Firestore console.

---

## Spec coverage check

| Spec requirement (PR 2) | Task |
|---|---|
| `/contacts` root → `withCrmAuth('viewer'/'member')` | Task 1 |
| `/contacts/[id]` → `viewer`/`member`/`member`-with-toggle | Task 2 |
| `/contacts/[id]/tags` → `member` | Task 3 |
| `/contacts/[id]/activities` → `viewer` | Task 4 |
| `/contacts/import` → `member` + per-row `createdByRef` | Task 5 |
| `createdByRef`/`updatedByRef`/`assignedToRef` on writes | Tasks 1-5 (Patterns B, C) |
| `membersCanDeleteContacts` toggle enforcement on DELETE | Task 2 (Pattern D) |
| Agent (Bearer) attribution = `AGENT_PIP_REF` | Tasks 1-5 (Pattern B/C handle `ctx.isAgent`) |
| Cross-tenant isolation tests | Task 6 |

---

## Risks + watch-outs

- **Existing test files use legacy `withAuth` mock pattern** — updating them is the bulk of Tasks 1, 2, 5. If migration is mechanical and the test breaks in unexpected ways, the helper `mockMember` in Pattern E may need extending with more `adminDb.collection` arms.
- **Webhook payload shape change** — adding `updatedByRef` to webhook bodies is a NEW field, never a removal. External webhook consumers (if any) won't break.
- **Activity feed `actorName` field** — existing `logActivity` calls pass `actorName: user.email` or similar. Change to `ctx.actor.displayName` so the agent appears as "Pip" rather than null on Bearer calls.
- **`logActivity` for agent calls** — current code may skip `actorId` for non-user actors; with `ctx.actor.uid === 'agent:pip'`, the agent's activity is now distinguishable. Confirm the activity feed UI handles `uid: 'agent:'`-prefixed values cleanly (it should — agent uids never collide with Firebase uids).
- **`assignedTo` historical values** — existing contacts may have `assignedTo` pointing at uids of former workspace members. Pattern C uses `resolveMemberRef` (tolerant) which returns `FORMER_MEMBER_REF` for those — no 500s.
- **The `[id]/tags` route currently requires `admin` role**; this PR downgrades to `member` per the spec matrix. If anyone (e.g. front-end) relied on `admin`-only access, that's a behavior change — but the spec matrix was the locked-in source of truth.

---

## Next step

After PR 2 ships and a manual smoke confirms `createdByRef` populates correctly in production, write **PR 3 (Deals migration)** plan via the same skill. PR 3 follows the same template — only 2 route files (`/deals` root + `[id]`), DELETE locked to `admin` (per matrix), `ownerRef` on `ownerUid` changes (analogous to `assignedToRef`).
