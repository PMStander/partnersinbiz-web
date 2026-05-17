# CRM Sub-1 PR 3 — Deals Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Migrate `/api/v1/crm/deals/*` (2 route files) from `withAuth + resolveOrgScope` to `withCrmAuth`. Adopt PR 2's forward-looking patterns. Write `MemberRef` snapshots for `createdByRef`, `updatedByRef`, and `ownerRef` (when `ownerUid` present). Preserve the special stage-change webhook fanout (`deal.stage_changed`, `deal.won`, `deal.lost`, `tryAttributeDealWon`).

**Spec:** [`docs/superpowers/specs/2026-05-16-crm-sub1-tenant-safety-design.md`](../specs/2026-05-16-crm-sub1-tenant-safety-design.md) — role matrix row "deals": GET viewer, POST member, PUT/PATCH member, DELETE admin. No toggle gate.

**PR 2 reference:** [`docs/superpowers/plans/2026-05-17-crm-sub1-pr2-contacts-migration.md`](../plans/2026-05-17-crm-sub1-pr2-contacts-migration.md) — Patterns A–E are reused here verbatim; don't restate them.

**Base SHA:** `94e2715` (PR 2 ship)

**Working directory:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## Forward-looking patterns adopted from PR 2 final review

1. **Use `ctx.actor` directly** — the `withCrmAuth` middleware already populates `ctx.actor` via `buildHumanRef(uid, orgMembers/{orgId}_{uid}.data())`. Calling `await snapshotForWrite(...)` re-fetches the same doc; skip it. For Bearer (agent), `ctx.actor` is already `AGENT_PIP_REF`. So the actor-resolution one-liner becomes:
   ```typescript
   const actorRef = ctx.actor  // already resolved by middleware
   ```
2. **Explicit-field webhook payloads** — never `...body` spread. Construct payloads with only the fields you intend to publish (id, title, value, stage, fromStage, toStage, ownerRef, createdByRef/updatedByRef). Defends against external consumers seeing leaked client-controlled fields.
3. **Isolation suite mocks enforce `where('orgId')` properly** — the per-org `.get()` mock should respect the chained `.where('orgId', '==', orgId)` call, not return all docs regardless. So if a route forgets `where('orgId')`, the test fails.
4. **`ownerRef` on POST when body has `ownerUid`** — mirror PR 2's `assignedToRef` fix. Use tolerant `resolveMemberRef` since owner may be a former member.

---

## File Structure

**Modified files (2):**

| Path | Change |
|---|---|
| `app/api/v1/crm/deals/route.ts` | GET → `withCrmAuth('viewer')`. POST → `withCrmAuth('member')` + write `createdByRef`/`updatedByRef`/`ownerRef`. Webhook payload uses explicit fields. |
| `app/api/v1/crm/deals/[id]/route.ts` | PUT/PATCH → `withCrmAuth('member')` + write `updatedByRef`/`ownerRef` (when `ownerUid` changes). DELETE → `withCrmAuth('admin')` + soft-delete + `updatedByRef`. Preserve stage-change webhook fanout, `tryAttributeDealWon`, per-outcome activity logging. |

**Modified test files (1):**

| Path | Change |
|---|---|
| `__tests__/api/v1/crm/deals.test.ts` | Migrate auth mocks to `stageAuth` pattern. Existing assertions preserved. Add tests for `createdByRef`/`ownerRef` on POST, `updatedByRef`/`ownerRef` on PUT, stage-change webhook payload uses explicit fields, DELETE writes `updatedByRef`. |

**New test files (1):**

| Path | Responsibility |
|---|---|
| `__tests__/api/v1/crm/deals-tenant-isolation.test.ts` | Cross-tenant isolation suite. Mock `contacts.where('orgId').get()` properly so missing-`where` regressions are caught. |

**Constraint:** Zero `lib/*` changes. Pure route migration.

---

## Tasks

### Task 1: Migrate `/api/v1/crm/deals/route.ts` (GET + POST)

**Files:** `app/api/v1/crm/deals/route.ts`, `__tests__/api/v1/crm/deals.test.ts`

**Role matrix:** GET → `viewer`, POST → `member`.

- [ ] **Step 1:** Read current route + test. Mirror `app/api/v1/crm/contacts/route.ts` style (commit `94e2715`).

- [ ] **Step 2:** Update test mocks to PR 2's `stageAuth` pattern. Add these new tests:
  ```typescript
  it('writes createdByRef and updatedByRef on POST (member)', async () => { /* assert both ref fields populated with displayName === 'Alice B', kind === 'human' */ })
  it('writes ownerRef when POST body has ownerUid', async () => { /* dual-uid mock; assert ownerRef.displayName === 'Bob C' */ })
  it('agent POST uses AGENT_PIP_REF for createdByRef and omits createdBy uid', async () => {})
  it('webhook payload uses explicit fields (no body spread)', async () => { /* capture dispatchWebhook calls; assert payload has exactly id/title/value/stage/contactId/createdByRef/ownerRef keys */ })
  ```

- [ ] **Step 3:** Run tests → expect failures.

- [ ] **Step 4:** Migrate the route:
  - Imports: replace `withAuth`+`resolveOrgScope` with `withCrmAuth` from `@/lib/auth/crm-middleware`, add `resolveMemberRef` from `@/lib/orgMembers/memberRef`
  - GET: `withCrmAuth('viewer', async (req, ctx) => { ... use ctx.orgId ... })`. Drop `?orgId=` parsing
  - POST: `withCrmAuth('member', async (req, ctx) => { ... })`. Apply PR 3 pattern 1 (use `ctx.actor` directly — no `snapshotForWrite`). Resolve `ownerRef` only when `body.ownerUid` is a non-empty string:
    ```typescript
    const actorRef = ctx.actor
    let ownerRef: MemberRef | undefined
    if (typeof body.ownerUid === 'string' && body.ownerUid !== '') {
      ownerRef = await resolveMemberRef(ctx.orgId, body.ownerUid)
    }
    const dealData = {
      orgId: ctx.orgId,
      contactId: body.contactId,
      title: body.title,
      value: body.value ?? 0,
      currency: body.currency ?? 'ZAR',
      stage: body.stage ?? 'discovery',
      expectedCloseDate: body.expectedCloseDate ?? null,
      notes: body.notes ?? '',
      deleted: false,
      ownerUid: typeof body.ownerUid === 'string' && body.ownerUid !== '' ? body.ownerUid : undefined,
      ownerRef,
      createdBy: ctx.isAgent ? undefined : ctx.actor.uid,
      createdByRef: actorRef,
      updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
      updatedByRef: actorRef,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    const sanitized = Object.fromEntries(Object.entries(dealData).filter(([, v]) => v !== undefined))
    const docRef = adminDb.collection('deals').doc()
    await docRef.set(sanitized)
    ```
  - **Webhook payload — explicit fields only:**
    ```typescript
    try {
      await dispatchWebhook(ctx.orgId, 'deal.created', {
        id: docRef.id,
        title: dealData.title,
        value: dealData.value,
        stage: dealData.stage,
        contactId: dealData.contactId,
        createdByRef: actorRef,
        ownerRef,  // may be undefined; consumer should handle absence
      })
    } catch (e) { console.error('webhook dispatch error', e) }
    ```
  - **`logActivity`** — change `actorId: user.uid` → `actorId: ctx.actor.uid`, `actorName: user.email` → `actorName: ctx.actor.displayName`
  - Preserve existing validation (`title` required, `contactId` required, stage/currency enums)

- [ ] **Step 5:** Run tests → all pass.

- [ ] **Step 6:** Commit `feat(crm): migrate deals root route to withCrmAuth + MemberRef attribution`

---

### Task 2: Migrate `/api/v1/crm/deals/[id]/route.ts` (PUT/PATCH + DELETE)

**Files:** `app/api/v1/crm/deals/[id]/route.ts`, `__tests__/api/v1/crm/deals.test.ts` (extend with [id] tests)

**Role matrix:** PUT/PATCH → `member` (downgrade from `admin`). DELETE → `admin`. No toggle gate.

This route's PUT has complex stage-transition logic — preserve it carefully.

- [ ] **Step 1:** Read current route. Mirror `app/api/v1/crm/contacts/[id]/route.ts` (commit `30ce214`) for the `handleUpdate` factor and tenant isolation pattern.

- [ ] **Step 2:** Add these new tests to `__tests__/api/v1/crm/deals.test.ts`:
  ```typescript
  it('writes updatedByRef on PUT (member)', async () => {})
  it('writes ownerRef when PUT body has new ownerUid', async () => {})
  it('agent PUT uses AGENT_PIP_REF for updatedByRef, omits updatedBy', async () => {})
  it('PUT with stage change fires deal.stage_changed webhook with explicit fields', async () => {
    /* assert webhook payload has only: id, fromStage, toStage, value, ownerRef, updatedByRef */
  })
  it('PUT stage → won fires deal.won webhook + tryAttributeDealWon + logs crm_deal_won activity', async () => {
    /* assert dispatchWebhook called with deal.won + correct payload, tryAttributeDealWon called, logActivity called with type crm_deal_won */
  })
  it('PUT stage → lost fires deal.lost webhook + logs crm_deal_lost activity', async () => {})
  it('PUT without stage change does NOT fire stage_changed webhook', async () => {})
  it('member PUT to deal in another org → 404', async () => {})
  it('DELETE requires admin role (member gets 403)', async () => {})
  it('DELETE soft-deletes and writes updatedByRef', async () => {})
  ```

  PUT/PATCH `handleUpdate` shared pattern (matches PR 2 `contacts/[id]`):
  ```typescript
  // Module-level private function
  async function handleDealUpdate(req, ctx, routeCtx) {
    const { id } = await routeCtx!.params
    const ref = adminDb.collection('deals').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Deal not found', 404)
    const before = snap.data()!
    if (before.orgId !== ctx.orgId) return apiError('Deal not found', 404)

    const body = await req.json()
    const actorRef = ctx.actor  // PR 3 pattern 1
    let ownerRef: MemberRef | undefined
    const ownerChanged = typeof body.ownerUid === 'string' && body.ownerUid !== before.ownerUid
    if (ownerChanged && body.ownerUid !== '') {
      ownerRef = await resolveMemberRef(ctx.orgId, body.ownerUid)
    }

    const patch: Record<string, unknown> = {
      ...body,  // legacy field passthrough — keep for now but explicit-field below for webhook
      updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
      updatedByRef: actorRef,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (ownerRef) patch.ownerRef = ownerRef
    const sanitized = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    await ref.update(sanitized)

    // Stage transitions
    const fromStage = before.stage
    const toStage = body.stage
    const stageChanged = typeof toStage === 'string' && toStage !== fromStage

    if (stageChanged) {
      try {
        await dispatchWebhook(ctx.orgId, 'deal.stage_changed', {
          id,
          fromStage,
          toStage,
          value: body.value ?? before.value,
          updatedByRef: actorRef,
          ownerRef: ownerRef ?? before.ownerRef,
        })
      } catch (e) { console.error('webhook dispatch error', e) }

      if (toStage === 'won') {
        try { await dispatchWebhook(ctx.orgId, 'deal.won', { id, value: body.value ?? before.value, title: before.title, updatedByRef: actorRef }) }
        catch (e) { console.error('webhook dispatch error', e) }
        try { await tryAttributeDealWon(ctx.orgId, id) } catch (e) { console.error('deal-won attribution error', e) }
        try { await logActivity({ orgId: ctx.orgId, type: 'crm_deal_won', actorId: ctx.actor.uid, actorName: ctx.actor.displayName, actorRole: ctx.role, entityId: id, entityType: 'deal', entityTitle: before.title, description: `Deal won: ${before.title}` }) }
        catch (e) { console.error('activity log error', e) }
      } else if (toStage === 'lost') {
        try { await dispatchWebhook(ctx.orgId, 'deal.lost', { id, value: body.value ?? before.value, title: before.title, updatedByRef: actorRef }) }
        catch (e) { console.error('webhook dispatch error', e) }
        try { await logActivity({ orgId: ctx.orgId, type: 'crm_deal_lost', actorId: ctx.actor.uid, actorName: ctx.actor.displayName, actorRole: ctx.role, entityId: id, entityType: 'deal', entityTitle: before.title, description: `Deal lost: ${before.title}` }) }
        catch (e) { console.error('activity log error', e) }
      }
    } else {
      try { await logActivity({ orgId: ctx.orgId, type: 'crm_deal_updated', actorId: ctx.actor.uid, actorName: ctx.actor.displayName, actorRole: ctx.role, entityId: id, entityType: 'deal', entityTitle: before.title, description: `Updated deal ${before.title}` }) }
      catch (e) { console.error('activity log error', e) }
    }

    return apiSuccess({ deal: { id, ...before, ...sanitized } })
  }

  export const PUT = withCrmAuth<{ params: Promise<{ id: string }> }>('member', handleDealUpdate)
  export const PATCH = withCrmAuth<{ params: Promise<{ id: string }> }>('member', handleDealUpdate)

  export const DELETE = withCrmAuth<{ params: Promise<{ id: string }> }>(
    'admin',
    async (req, ctx, routeCtx) => {
      const { id } = await routeCtx!.params
      const ref = adminDb.collection('deals').doc(id)
      const snap = await ref.get()
      if (!snap.exists) return apiError('Deal not found', 404)
      const data = snap.data()!
      if (data.orgId !== ctx.orgId) return apiError('Deal not found', 404)

      const actorRef = ctx.actor
      const deletePatch: Record<string, unknown> = {
        deleted: true,
        updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
        updatedByRef: actorRef,
        updatedAt: FieldValue.serverTimestamp(),
      }
      const sanitized = Object.fromEntries(Object.entries(deletePatch).filter(([, v]) => v !== undefined))
      await ref.update(sanitized)

      try { await logActivity({ orgId: ctx.orgId, type: 'crm_deal_deleted', actorId: ctx.actor.uid, actorName: ctx.actor.displayName, actorRole: ctx.role, entityId: id, entityType: 'deal', entityTitle: data.title, description: `Deleted deal ${data.title}` }) }
      catch (e) { console.error('activity log error', e) }

      return apiSuccess({ id })
    },
  )
  ```

- [ ] **Step 3:** Run tests → expect failures.
- [ ] **Step 4:** Apply the route migration.
- [ ] **Step 5:** Run tests → all pass.
- [ ] **Step 6:** Commit `feat(crm): migrate deals/[id] route to withCrmAuth + ownerRef + preserve stage webhook fanout`

---

### Task 3: Cross-tenant isolation suite

**Files:** `__tests__/api/v1/crm/deals-tenant-isolation.test.ts` (new)

Mirror `contacts-tenant-isolation.test.ts` from PR 2 (`404400a`). Apply PR 3 pattern 3: the `deals` collection mock's `.get()` must respect the chained `.where('orgId', '==', orgId)` call rather than always returning all docs.

Pattern for proper where-respecting mock:
```typescript
if (name === 'deals') {
  let whereOrgFilter: string | undefined
  const queryMock = {
    where: jest.fn((field: string, op: string, value: any) => {
      if (field === 'orgId' && op === '==') whereOrgFilter = value
      return queryMock
    }),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: () => Promise.resolve({
      docs: [
        { id: 'a1', data: () => dealA, ref: { id: 'a1' } },
        { id: 'b1', data: () => dealB, ref: { id: 'b1' } },
      ].filter(d => whereOrgFilter === undefined || (d.data() as any).orgId === whereOrgFilter),
    }),
  }
  return {
    doc: jest.fn().mockImplementation((id?: string) => ({
      id: id ?? 'auto-id',
      get: () => Promise.resolve({
        exists: id === 'a1' || id === 'b1',
        id: id ?? 'auto-id',
        data: () => (id === 'a1' ? dealA : id === 'b1' ? dealB : undefined),
      }),
      set: jest.fn(),
      update: jest.fn(),
    })),
    ...queryMock,
  }
}
```

Tests:
- member-of-A POST writes scoped to org-a with `ctx.actor` displayName
- Bearer POST uses AGENT_PIP_REF
- member-of-A 404s on GET/PUT/DELETE org-B deal
- Bearer with `X-Org-Id: org-a` 404s on org-B deal
- member-of-A GET list shows only org-a deals (catches missing `where('orgId')` if route ever regresses)
- Bearer GET list with `X-Org-Id: org-a` shows only org-a deals
- member PUT setting `stage: 'won'` fires `deal.won` webhook
- member DELETE → 403 (not admin), admin DELETE → 200

Commit: `test(crm): consolidated cross-tenant isolation suite for deals routes (PR 3)`

---

### Task 4: Final verification + push

- [ ] Run full jest: `NODE_OPTIONS=--max-old-space-size=8192 npx jest --no-coverage 2>&1 | tail -8` — all green
- [ ] Run build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | grep -E "(Compiled|error|failed)" | head -5` — clean
- [ ] Verify only deals files touched: `git diff --stat 94e2715..HEAD -- app/api/v1/crm/deals __tests__/api/v1/crm/deals*`
- [ ] No `lib/*` changes: `git diff --stat 94e2715..HEAD -- lib/` — empty for CRM-related paths
- [ ] Push: `git push origin main`
- [ ] Update wiki hot.md + log session

---

## Ship Gate

- ~15-20 new tests + all previously-passing tests still pass
- `npm run build` clean
- Zero `lib/*` changes
- Manual smoke (recommended): create a deal via portal as a member, verify Firestore doc has `createdByRef`/`updatedByRef` populated; move it to `won` and verify the `deal.won` webhook fires

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| `/deals` root → `withCrmAuth('viewer'/'member')` + `createdByRef` + `ownerRef` (when ownerUid present) | Task 1 |
| `/deals/[id]` → `withCrmAuth('member')` PUT/PATCH, `withCrmAuth('admin')` DELETE | Task 2 |
| Stage-change webhook fanout preserved (`deal.stage_changed`, `deal.won`, `deal.lost`) | Task 2 |
| `tryAttributeDealWon` preserved on stage→won transition | Task 2 |
| Per-outcome activity logging preserved | Task 2 |
| `updatedByRef`/`ownerRef` on writes | Tasks 1+2 |
| Cross-tenant isolation tests + proper `where`-respecting mock | Task 3 |

---

## Risks + watch-outs

- **PUT currently allows arbitrary body field passthrough** (no allowlist) — preserving via `...body` spread maintains backwards compat with any legacy callers. Don't tighten in PR 3.
- **`tryAttributeDealWon`** is best-effort (try/catch + log). Don't surface its errors to the response.
- **Existing test file** likely tests minimal cases — the new attribution/webhook/role tests effectively double-test the route. That's fine, it's a tenant-safety net.
- **Currency enum** uses `Currency` type from `lib/crm/types.ts` — preserve validation.

---

## Next step

After PR 3 ships, write **PR 4 (Activities + Segments — 5 routes)** plan. Activities has the most complex permission model: member can edit/delete own activities, admin+ can edit/delete any. Segments are admin across the board.
