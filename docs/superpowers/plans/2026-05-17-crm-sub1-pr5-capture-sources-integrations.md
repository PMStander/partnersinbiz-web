# CRM Sub-1 PR 5 — Capture-sources + Integrations Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Migrate 5 routes to `withCrmAuth`. Integrations routes preserve their `encryptCredentials`/`decryptCredentials` calls untouched — only the auth wrapper changes. Capture-sources is simpler (admin gating).

**Spec role matrix:**
| Route | GET | POST | PUT | DELETE |
|---|---|---|---|---|
| capture-sources (root + [id]) | viewer | admin | admin | admin |
| integrations (root + [id]) | admin | admin | admin | admin |
| integrations/[id]/sync | — | admin (POST) | — | — |

**Why integrations is all-admin (not just write paths):** the GET returns decrypted-then-redacted credential previews. Even read access is admin-only to limit surface area for credential exfiltration.

**Reference:** PR 4 commits + patterns — `869437d` (activities), `0c1e46a` (segments + loadSegment), `1708009` (preview/resolve), `e987dc5` (isolation suite), `c121b71` (loadSegment+parseDate fixes).

**Forward-looking patterns (PR 3+4) to USE:**
1. `ctx.actor` directly (no `snapshotForWrite`)
2. Explicit-field response payloads (n/a — no webhooks in PR 5)
3. `where`-respecting isolation mock
4. Tenant isolation + soft-delete check unified via shared loader (mirror `loadSegment`)
5. **NEW:** Encryption calls (`encryptCredentials`, `decryptCredentials`, `toPublicView`) preserved verbatim — only the auth wrapper changes

**Base SHA:** `c121b71` (PR 4 ship). **Working dir:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## Lessons from PR 4 (applied here)

- **Test-file sweep upfront:** before Task 1, run `find __tests__ -name "*.test.ts" | xargs grep -l 'crm/integrations\|crm/capture-sources'` to discover ALL test files that reference the routes. PR 4 missed `__tests__/api/activities-filters.test.ts` (legacy path). Found: `__tests__/api/v1/crm/integrations-sync.test.ts`, `__tests__/api/integrations-encryption.test.ts`. Capture-sources has NO existing tests.
- **Soft-delete tests explicit:** capture-sources uses soft-delete (`deleted: true`); test GET/PUT/DELETE on soft-deleted records → 404.
- **Input validation can vanish in migration:** scan existing routes for silent validators (parseDate-style) before rewriting.

---

## File Structure

**Modified routes (5):**
- `app/api/v1/crm/capture-sources/route.ts` — GET viewer, POST admin + `createdByRef`/`updatedByRef`
- `app/api/v1/crm/capture-sources/[id]/route.ts` — GET viewer, PUT admin (`rotateKey` flag preserved), DELETE admin
- `app/api/v1/crm/integrations/route.ts` — GET admin (decrypts internally), POST admin + `createdByRef`/`updatedByRef`. Encryption via `encryptCredentials` + `toPublicView` PRESERVED VERBATIM
- `app/api/v1/crm/integrations/[id]/route.ts` — GET/PUT/DELETE all admin. Encryption + provider-schema-validated config merging PRESERVED
- `app/api/v1/crm/integrations/[id]/sync/route.ts` — POST admin. Sync handler invocation + status/lastSyncedAt/lastSyncStats writes PRESERVED. Add `updatedByRef` on the status writes

**Modified tests (2 — existing):**
- `__tests__/api/v1/crm/integrations-sync.test.ts` — migrate auth mocks to `withCrmAuth`
- `__tests__/api/integrations-encryption.test.ts` — migrate auth mocks

**New tests (3):**
- `__tests__/api/v1/crm/capture-sources.test.ts` — route-level tests (none exist)
- `__tests__/api/v1/crm/integrations.test.ts` — route-level tests (handler tests exist separately)
- `__tests__/api/v1/crm/capture-sources-integrations-tenant-isolation.test.ts` — consolidated isolation suite

**Constraint:** Zero `lib/*` changes. Encryption module untouched.

---

## Tasks

### Task 1: Migrate capture-sources root + [id]

**Files:** `app/api/v1/crm/capture-sources/route.ts`, `app/api/v1/crm/capture-sources/[id]/route.ts`, NEW `__tests__/api/v1/crm/capture-sources.test.ts`

**Role matrix:** GET viewer, POST/PUT/DELETE admin. No toggle.

- [ ] Step 1: Read both routes + the segments routes (`0c1e46a` — same role shape). Note: `[id]` route has the special `rotateKey: true` flag that regenerates the `publicKey` via `generatePublicKey()` helper from `lib/crm/captureSources.ts`. Preserve.

- [ ] Step 2: Write test file `capture-sources.test.ts` with `stageAuth` (extend for `capture_sources` collection — note underscore). Tests:
  - viewer GET list + GET by id (own org); cross-org GET → 404
  - admin POST writes `createdByRef`/`updatedByRef` + generates publicKey
  - admin PUT writes `updatedByRef`; `{ rotateKey: true }` regenerates publicKey
  - admin DELETE soft-deletes with `updatedByRef`
  - **GET/PUT/DELETE on soft-deleted record → 404** (apply loadSegment-style helper)
  - member/viewer cannot POST/PUT/DELETE (403)
  - agent (Bearer) bypasses admin

- [ ] Step 3: Run tests → fail.

- [ ] Step 4: Migrate. Create a `loadCaptureSource(id, ctxOrgId)` helper in `[id]/route.ts` mirroring `loadSegment` — checks exists, orgId match, deleted=false. PUT handler still supports `rotateKey: true`. POST root writes attribution.

- [ ] Step 5: Run tests → pass.

- [ ] Step 6: Commit `feat(crm): migrate capture-sources + capture-sources/[id] routes to withCrmAuth + MemberRef attribution`

---

### Task 2: Migrate integrations root

**Files:** `app/api/v1/crm/integrations/route.ts`, NEW `__tests__/api/v1/crm/integrations.test.ts`

**Role matrix:** GET admin, POST admin. **Encryption preserved.**

- [ ] Step 1: Read route carefully. Note exact call signatures of `encryptCredentials`, `toPublicView`, `findProvider`. Read `lib/crm/integrations/types.ts` to confirm exports.

- [ ] Step 2: Write `integrations.test.ts`. Mock `lib/crm/integrations/types` if needed; let the encryption modules run real (or mock them to identity). Tests:
  - admin can GET list (org-scoped); response is array of `toPublicView`-shaped objects (no raw secrets visible)
  - member/viewer cannot GET (403) — important: admin-only even on READ because GET returns redacted secrets
  - admin POST with valid provider+config creates integration; `configEnc` is written (the encrypted blob); response is `toPublicView` (sensitive fields masked)
  - admin POST writes `createdByRef`/`updatedByRef`
  - POST with unknown provider → 400
  - POST with invalid config (provider-schema violation) → 400
  - agent (Bearer) bypasses admin

- [ ] Step 3: Run tests → fail.

- [ ] Step 4: Migrate. Auth swap only. Preserve the `findProvider` validation, `encryptCredentials` call, `configPreview` construction, `toPublicView` response shape. Add `createdByRef`/`updatedByRef` to the doc data. Sanitize undefined.

  ```typescript
  const actorRef = ctx.actor
  const doc = {
    orgId: ctx.orgId,
    provider: body.provider,
    name: body.name,
    configEnc: await encryptCredentials(body.config),
    configPreview: buildConfigPreview(body.config, provider),
    autoTags: body.autoTags ?? [],
    autoCampaignIds: body.autoCampaignIds ?? [],
    cadenceMinutes: body.cadenceMinutes ?? provider.defaultCadenceMinutes,
    status: 'paused',
    deleted: false,
    createdBy: ctx.isAgent ? undefined : ctx.actor.uid,
    createdByRef: actorRef,
    updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
    updatedByRef: actorRef,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  const sanitized = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined))
  const docRef = adminDb.collection('crm_integrations').doc()  // Or whatever collection name the existing route uses
  await docRef.set(sanitized)
  return apiSuccess(toPublicView({ id: docRef.id, ...sanitized }), 201)
  ```

  Adjust collection name to match existing route exactly.

- [ ] Step 5: Run tests → pass.

- [ ] Step 6: Commit `feat(crm): migrate integrations root route to withCrmAuth + MemberRef attribution (encryption preserved)`

---

### Task 3: Migrate integrations/[id] + [id]/sync

**Files:** `app/api/v1/crm/integrations/[id]/route.ts`, `app/api/v1/crm/integrations/[id]/sync/route.ts`, update `__tests__/api/v1/crm/integrations-sync.test.ts` + `__tests__/api/integrations-encryption.test.ts`, extend `integrations.test.ts` with `[id]` tests

**Role matrix:** All admin. **Encryption preserved.**

- [ ] Step 1: Read both routes. `[id]` PUT does decrypt → merge → re-encrypt. `[id]/sync` POST routes to provider-specific handlers.

- [ ] Step 2: Migrate existing `integrations-sync.test.ts` and `integrations-encryption.test.ts` auth mocks (apply `stageAuth` pattern). Extend `integrations.test.ts` with `[id]` tests:
  - admin GET [id] (own org) returns `toPublicView`; cross-org → 404; soft-deleted → 404
  - admin PUT updates `name`/`autoTags`/`cadenceMinutes`/`status` + writes `updatedByRef`
  - admin PUT with new config field re-encrypts via `encryptCredentials` (decrypt → merge → re-encrypt)
  - admin DELETE soft-deletes + `updatedByRef`
  - admin POST /sync triggers handler (mock `syncMailchimp`/`syncHubspot`/`syncGmail`); writes `lastSyncedAt`, `lastSyncStats`, `status: 'active'` on success; writes `status: 'error'` + `lastError` on failure
  - **NEW:** POST /sync writes `updatedByRef` on the status updates (since admin triggered it)
  - cross-org sync → 404

- [ ] Step 3: Run tests → fail.

- [ ] Step 4: Migrate both routes. Create `loadIntegration(id, ctxOrgId)` helper (mirrors `loadSegment`) — checks exists + orgId + not-deleted. Use in GET/PUT/DELETE and sync POST.

  For sync route, preserve the 4-step flow: status='syncing' → invoke handler → status='active'/'error'. Add `updatedByRef` to the status writes (so the activity feed can show who triggered the sync).

- [ ] Step 5: Run tests → pass.

- [ ] Step 6: Commit `feat(crm): migrate integrations/[id] + sync routes to withCrmAuth (encryption + sync flow preserved)`

---

### Task 4: Cross-tenant isolation suite

**Files:** Create `__tests__/api/v1/crm/capture-sources-integrations-tenant-isolation.test.ts`

Mirror `__tests__/api/v1/crm/activities-segments-tenant-isolation.test.ts` (PR 4 `e987dc5`). Two route groups in one file. ~12-15 tests. Use `where`-respecting mock for `capture_sources` + `crm_integrations` (or whatever the actual collection name is — verify in Task 2). Distinct uids to avoid substring-collision bug.

Tests:
- capture-sources POST member (admin required, member → 403)
- capture-sources POST admin writes scoped to org-a with createdByRef.displayName
- capture-sources GET list scoped (catches missing where)
- agent capture-sources POST uses AGENT_PIP_REF
- integrations POST member (admin required, member → 403)
- integrations POST admin: configEnc is the encrypted blob, configPreview is masked, response is toPublicView
- integrations GET list returns only org-a entries
- agent integrations POST uses AGENT_PIP_REF
- integrations PUT cross-org → 404
- integrations DELETE cross-org → 404
- integrations sync cross-org → 404
- integrations sync writes updatedByRef

Commit: `test(crm): consolidated cross-tenant isolation suite for capture-sources + integrations routes (PR 5)`

---

### Task 5: Final verification + push

- [ ] Run full jest suite — all green
- [ ] Run build — clean
- [ ] Verify only PR 5 files touched: `git diff --stat c121b71..HEAD -- app/api/v1/crm/capture-sources app/api/v1/crm/integrations __tests__/api/v1/crm/capture-sources* __tests__/api/v1/crm/integrations* __tests__/api/v1/crm/capture-sources-integrations* __tests__/api/integrations*`
- [ ] No `lib/*` changes from this PR (encryption module untouched)
- [ ] Push: `git push origin main`
- [ ] Update wiki

---

## Ship Gate

- 5 routes migrated, all using `withCrmAuth(minRole)`
- `encryptCredentials`/`decryptCredentials` calls preserved verbatim (zero `lib/crm/integrations/*` changes, zero `lib/integrations/crypto.ts` changes)
- ~30+ new tests
- `npm run build` clean
- Manual smoke recommended: create an integration via portal as admin, verify `configEnc` is written + `configPreview` masks correctly + GET response uses `toPublicView`

---

## Spec coverage check

| Spec row | Task |
|---|---|
| capture-sources root → viewer/admin + createdByRef | Task 1 |
| capture-sources/[id] → viewer/admin/admin + soft-delete + rotateKey | Task 1 |
| integrations root → admin/admin + encryption | Task 2 |
| integrations/[id] → all admin + encryption decrypt-merge-encrypt | Task 3 |
| integrations/[id]/sync → admin POST + handler flow | Task 3 |
| Cross-tenant isolation for all 5 routes | Task 4 |

---

## Risks + watch-outs

- **Encryption is the highest-risk surface.** Read calls of `encryptCredentials` / `decryptCredentials` / `toPublicView` / `buildConfigPreview` line-by-line in each route. Migration touches AUTH ONLY — do not adjust argument order, do not refactor, do not "improve". The encryption module has its own test coverage.
- **Provider-schema validation** is in `findProvider(body.provider)?.validateConfig?.(body.config)` — preserve.
- **`rotateKey: true` on capture-sources PUT** regenerates `publicKey` via `generatePublicKey()`. Tests must cover both the normal PUT path and the rotate path.
- **Sync route status state machine** (`syncing` → `active`/`error`) is fragile if interrupted. Don't add new awaits between the status writes.
- **`integrations-encryption.test.ts` is at legacy path** `__tests__/api/...` not `__tests__/api/v1/crm/...`. Caught by upfront grep.
- **Collection name verification:** root integrations POST writes to a collection — confirm it's `crm_integrations` (or whatever name) BEFORE writing the new code. Don't assume.

---

## Next step

After PR 5 ships, **PR 6 (Forms — 5 routes including the public `/submit` endpoint)** is the special one: `/forms/[id]/submit` is public (anonymous), but creates a contact via `formSubmissionRef(formId, formName)` synthetic actor instead of a real member ref.
