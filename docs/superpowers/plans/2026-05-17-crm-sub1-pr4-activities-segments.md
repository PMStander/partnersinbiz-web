# CRM Sub-1 PR 4 — Activities + Segments Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Migrate `/api/v1/crm/activities/*` (1 route) + `/api/v1/crm/segments/*` (4 routes) from `withAuth + resolveOrgScope` to `withCrmAuth`. Apply the 4 forward-looking patterns established in PR 3.

**Audit finding:** activities root has only GET + POST. There is NO PATCH or DELETE route for activities yet. The spec's "own vs other" permission gate is for future feature work; PR 4 doesn't exercise it. PR 4 is purely a mechanical migration.

**Spec:** [`docs/superpowers/specs/2026-05-16-crm-sub1-tenant-safety-design.md`](../specs/2026-05-16-crm-sub1-tenant-safety-design.md)

Role matrix rows:
| Route | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| activities (root) | viewer | member | (not yet built) | (not yet built) |
| segments | viewer | admin | — | — |
| segments/[id] | viewer | — | admin | admin |
| segments/preview | — | admin (POST) | — | — |
| segments/[id]/resolve | — | admin (POST) | — | — |

**Reference:** PR 3 patterns + commits — `8dd1703` (deals root), `3a97a20` (deals/[id]), `fbdcbb3` (post-review fixes), `3abc8d4` (isolation suite). Mirror their style.

**PR 3 forward-looking patterns to USE:**
1. `ctx.actor` directly (no `snapshotForWrite` re-fetch)
2. Explicit-field webhook payloads (n/a for PR 4 — no webhooks here)
3. `where`-respecting isolation mock
4. Wrap best-effort side effects in try/catch

**Base SHA:** `fbdcbb3` (PR 3 ship). **Working dir:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## File Structure

**Modified files (5 routes):**

| Path | Change |
|---|---|
| `app/api/v1/crm/activities/route.ts` | GET → `withCrmAuth('viewer')`, POST → `withCrmAuth('member')` + write `createdByRef` |
| `app/api/v1/crm/segments/route.ts` | GET → `withCrmAuth('viewer')`, POST → `withCrmAuth('admin')` + `createdByRef`/`updatedByRef` |
| `app/api/v1/crm/segments/[id]/route.ts` | GET → `viewer`, PUT → `admin` + `updatedByRef`, DELETE → `admin` + `updatedByRef` |
| `app/api/v1/crm/segments/preview/route.ts` | POST → `admin` (no writes — just query against contacts; no attribution needed) |
| `app/api/v1/crm/segments/[id]/resolve/route.ts` | POST → `admin` (no writes — materializes saved segment) |

**Modified test files (3):**
- `__tests__/api/v1/crm/activities.test.ts` — migrate to `stageAuth` + add `createdByRef` test
- `__tests__/api/v1/crm/activities-list.test.ts` — migrate to `stageAuth`
- (No existing segments route test file at `__tests__/api/v1/crm/segments.test.ts`? — check; if missing, this becomes a new file)

**New test files (1):**
- `__tests__/api/v1/crm/activities-segments-tenant-isolation.test.ts` — consolidated cross-tenant isolation suite for both groups. Use `where`-respecting mock pattern from PR 3 commit `3abc8d4`.

**Constraint:** Zero `lib/*` changes. Pure route migration.

---

## Tasks

### Task 1: Migrate activities root

**Files:** `app/api/v1/crm/activities/route.ts`, `__tests__/api/v1/crm/activities.test.ts`, `__tests__/api/v1/crm/activities-list.test.ts`

**Role matrix:** GET → `viewer`, POST → `member`.

- [ ] **Step 1:** Read current route + tests. Mirror `app/api/v1/crm/deals/route.ts` (PR 3 Task 1, `8dd1703`).

- [ ] **Step 2:** Update test mocks to `stageAuth` pattern (matches PR 3's `__tests__/api/v1/crm/deals.test.ts`). The activities tests are split across 2 files (POST validation + GET list) — apply the pattern to both.

  Add new test:
  ```typescript
  it('writes createdByRef on POST (member)', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member', firstName: 'Alice', lastName: 'B' })
    const captured = jest.fn().mockResolvedValue({ id: 'act-1' })
    stageAuth(member, {}, { capturedActivityAdd: captured })
    const req = callAsMember(member, 'POST', '/api/v1/crm/activities', {
      contactId: 'c1', type: 'note', summary: 'Test note',
    })
    const { POST } = await import('@/app/api/v1/crm/activities/route')
    const res = await POST(req)
    expect(res.status).toBeLessThan(300)
    const data = captured.mock.calls[0][0]
    expect(data.createdByRef.displayName).toBe('Alice B')
    expect(data.createdByRef.kind).toBe('human')
    expect(data.createdBy).toBe('uid-1')  // existing field — preserve
  })

  it('agent POST uses AGENT_PIP_REF and omits createdBy uid', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member' })
    const captured = jest.fn().mockResolvedValue({ id: 'act-2' })
    stageAuth(member, {}, { capturedActivityAdd: captured })
    const req = callAsAgent('org-1', 'POST', '/api/v1/crm/activities', {
      contactId: 'c1', type: 'note', summary: 'Agent note',
    })
    const { POST } = await import('@/app/api/v1/crm/activities/route')
    const res = await POST(req)
    expect(res.status).toBeLessThan(300)
    const data = captured.mock.calls[0][0]
    expect(data.createdByRef.uid).toBe('agent:pip')
    expect(data.createdBy).toBeUndefined()
  })
  ```

  Important: activities use `.collection('activities').add(data)` (auto-id), not `.doc().set()`. The `stageAuth` activities mock must capture via `.add()`:
  ```typescript
  if (name === 'activities') {
    const addFn = opts?.capturedActivityAdd ?? jest.fn().mockResolvedValue({ id: 'auto-act-id' })
    return {
      add: addFn,
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
    }
  }
  ```

- [ ] **Step 3:** Run tests → expect failures.

- [ ] **Step 4:** Migrate the route. Pattern is identical to deals root POST:
  ```typescript
  export const POST = withCrmAuth('member', async (req, ctx) => {
    const body = await req.json()
    // ... existing validation (contactId, type enum, summary required) preserved ...
    const actorRef = ctx.actor
    const docData = {
      orgId: ctx.orgId,
      contactId: body.contactId.trim(),
      dealId: body.dealId ?? '',
      type: body.type,
      summary: body.summary.trim(),
      metadata: body.metadata ?? {},
      createdBy: ctx.isAgent ? undefined : ctx.actor.uid,
      createdByRef: actorRef,
      createdAt: FieldValue.serverTimestamp(),
    }
    const sanitized = Object.fromEntries(Object.entries(docData).filter(([, v]) => v !== undefined))
    const docRef = await adminDb.collection('activities').add(sanitized)
    return apiSuccess({ id: docRef.id, ...sanitized }, 201)
  })

  export const GET = withCrmAuth('viewer', async (req, ctx) => {
    // ... preserve existing query logic: orgId, contactId, type[], dateFrom/dateTo, pagination ...
    // Use ctx.orgId instead of resolveOrgScope result
  })
  ```

  Note: Activity has no `updatedBy*` field on its type — POST only, no updates. So only `createdBy*` fields are written.

- [ ] **Step 5:** Run tests → pass.

- [ ] **Step 6:** Commit `feat(crm): migrate activities root to withCrmAuth + MemberRef attribution`

---

### Task 2: Migrate segments root + `[id]`

**Files:** `app/api/v1/crm/segments/route.ts`, `app/api/v1/crm/segments/[id]/route.ts`, `__tests__/api/v1/crm/segments.test.ts` (may need to create)

**Role matrix:** GET → `viewer`, POST → `admin`, PUT → `admin`, DELETE → `admin`.

- [ ] **Step 1:** Read current route files. Mirror PR 3 patterns.

- [ ] **Step 2:** Create/update test file with `stageAuth` for segments. The collection name is `segments`. Add tests:
  - viewer can GET list + GET by id (scoped to org)
  - member cannot POST/PUT/DELETE (403)
  - admin can POST with `createdByRef` written
  - admin can PUT with `updatedByRef`
  - admin DELETE writes `deleted: true` + `updatedByRef`
  - cross-tenant GET/PUT/DELETE → 404
  - agent (Bearer) can do all (system role bypasses admin)

- [ ] **Step 3:** Run tests → fail.

- [ ] **Step 4:** Migrate both routes. Use `withCrmAuth(...)` for all 5 methods. Apply PR 3 patterns:
  - `ctx.actor` directly for `createdByRef`/`updatedByRef`
  - Tenant isolation 404 (`if (data.orgId !== ctx.orgId) return apiError('Segment not found', 404)`)
  - Sanitize (`Object.fromEntries(filter undefined)`)
  - DELETE soft-delete preserved + add `updatedByRef`/`updatedBy`

  For `[id]` route, factor a shared `handleSegmentUpdate` if PUT and PATCH both exist (or just PUT alone — check current).

- [ ] **Step 5:** Run tests → pass.

- [ ] **Step 6:** Commit `feat(crm): migrate segments + segments/[id] routes to withCrmAuth + MemberRef attribution`

---

### Task 3: Migrate segments preview + resolve

**Files:** `app/api/v1/crm/segments/preview/route.ts`, `app/api/v1/crm/segments/[id]/resolve/route.ts`

**Role matrix:** Both POST → `admin`. No writes — these are query-only endpoints.

- [ ] **Step 1:** Read both files. They query the `contacts` collection based on `SegmentFilters`. No segment doc is written; no contact is modified.

- [ ] **Step 2:** Update tests to use `stageAuth` (or extend the segments test file from Task 2). Tests:
  - admin can call preview with filters → returns count + sample
  - viewer/member cannot call preview (403)
  - admin can call `[id]/resolve` → returns count + ids
  - cross-tenant: `[id]/resolve` on org-B segment by org-A admin → 404
  - agent (Bearer) can call both

- [ ] **Step 3:** Run tests → fail.

- [ ] **Step 4:** Migrate both routes. Use `withCrmAuth('admin', ...)`. Preserve all existing filter sanitization, contact-query logic, response shape (`{ count, sample }` or `{ count, ids, contacts }`).

  For `[id]/resolve`, tenant isolation: read the segment doc first; verify `segment.orgId === ctx.orgId`; else 404.

- [ ] **Step 5:** Run tests → pass.

- [ ] **Step 6:** Commit `feat(crm): migrate segments/preview + segments/[id]/resolve to withCrmAuth('admin')`

---

### Task 4: Cross-tenant isolation suite

**Files:** Create `__tests__/api/v1/crm/activities-segments-tenant-isolation.test.ts`

Mirror PR 3's `deals-tenant-isolation.test.ts` (`3abc8d4`). Use `where`-respecting mock. Two domains in one file (activities + segments) because they're both PR 4. Test members of two orgs (A, B) across all 5 migrated routes. ~12-15 tests.

Key tests:
- activities POST: createdByRef populated, scoped to org-a
- activities GET list: returns only org-a activities (catches missing `where('orgId')`)
- agent activities POST: AGENT_PIP_REF
- segments POST: admin role required (member → 403)
- segments POST by admin: createdByRef populated, scoped
- segments PUT cross-tenant: 404
- segments DELETE cross-tenant: 404
- preview by admin returns counts; viewer/member → 403
- resolve cross-tenant: 404
- agent (Bearer) bypasses all role gates

Commit: `test(crm): consolidated cross-tenant isolation suite for activities + segments routes (PR 4)`

---

### Task 5: Final verification + push

- [ ] Run full jest: `NODE_OPTIONS=--max-old-space-size=8192 npx jest --no-coverage 2>&1 | tail -8` — all green
- [ ] Run build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | grep -E "(Compiled|error|failed)" | head -5` — clean
- [ ] Verify only PR 4 files touched: `git diff --stat fbdcbb3..HEAD -- app/api/v1/crm/activities app/api/v1/crm/segments __tests__/api/v1/crm/activities* __tests__/api/v1/crm/segments* __tests__/api/v1/crm/activities-segments-tenant-isolation.test.ts`
- [ ] No `lib/*` changes from this PR: `git diff --stat fbdcbb3..HEAD -- lib/`
- [ ] Push: `git push origin main`
- [ ] Update wiki (hot.md + log + index)

---

## Ship Gate

- 5 routes migrated, all using `withCrmAuth(minRole)`
- ~25-30 new tests
- `npm run build` clean
- Zero `lib/*` changes

---

## Spec coverage

| Spec row | Task |
|---|---|
| activities root → viewer/member + createdByRef | Task 1 |
| segments root → viewer/admin + createdByRef/updatedByRef | Task 2 |
| segments/[id] → viewer/admin/admin | Task 2 |
| segments/preview → admin POST | Task 3 |
| segments/[id]/resolve → admin POST | Task 3 |
| Cross-tenant isolation tests for all 5 routes | Task 4 |

---

## Risks + watch-outs

- **Activities collection uses `.add()` not `.doc().set()`** — mock pattern differs from contacts/deals. Already addressed in Task 1.
- **`SegmentFilters` sanitization** — `lib/crm/segments.ts` has a `sanitizeFilters()` helper. Preserve all sanitization in the migrated routes; don't reinvent it.
- **No activity webhooks today** — don't add them in PR 4. The Activity record IS the audit log; webhooks would be redundant.
- **`segments/preview` does NOT need tenant isolation in the same way** — it doesn't read a saved segment, it constructs an ephemeral filter and runs it against contacts. The contacts query already filters by `ctx.orgId`. Just verify the route uses `ctx.orgId` in the contacts query, not body-supplied orgId.
- **PR 3's `tryAttributeDealWon` bare-await lesson** — scan each PR 4 route for any `await someExternalCall(...)` outside try/catch and wrap if best-effort.

---

## Next step

After PR 4 ships, **PR 5 (Capture-sources + Integrations — 5 routes)**. Capture-sources is similar to contacts/deals; Integrations is special because it handles encrypted credentials (AES-256-GCM with SOCIAL_TOKEN_MASTER_KEY). Migration is just auth swap — encryption stays in `lib/crm/integrations/store.ts`.
