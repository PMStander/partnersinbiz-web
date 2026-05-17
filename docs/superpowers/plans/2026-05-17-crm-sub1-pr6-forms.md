# CRM Sub-1 PR 6 — Forms Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Migrate 4 auth-required form routes to `withCrmAuth`. Keep `/submit` public but add `formSubmissionRef(formId, formName)` attribution to FormSubmission + auto-created Contact + activity.

**Audit findings (vs. earlier assumptions):**
- Forms have NO `publicKey` (that's CaptureSource) — no `rotateKey` work
- `formSubmissionRef` is already exported from `lib/orgMembers/memberRef.ts` (shipped in PR 1)
- FormSubmission interface already has `createdBy?`/`createdByRef?` fields (PR 1 type extensions) — just not populated
- **ZERO existing tests** for form routes — PR 6 creates the entire test surface
- Slug change restriction (only if no submissions exist) — preserve in PUT

**Spec role matrix (`/forms/*`):**
| Route | GET | POST | PUT | DELETE |
|---|---|---|---|---|
| forms root | viewer (was admin) | admin | — | — |
| forms/[id] | viewer | — | admin | admin |
| forms/[id]/submissions | viewer | — | — | — |
| forms/[id]/submissions/[subId] | viewer | — | admin (PATCH status) | — |
| forms/[id]/submit | (public) | (public) | — | — |

GET role downgrades from `admin` → `viewer` per spec. Writes stay admin.

**Reference:** PR 5 patterns — `5098cf9` (capture-sources `loadCaptureSource`), `d29975c` (handleUpdate factor + soft-delete check), `a735178` (isolation suite). Mirror.

**Base SHA:** `0ce22e8` (PR 5 ship). **Working dir:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## Forward-looking patterns (PR 3-5) to USE

1. `ctx.actor` directly (no `snapshotForWrite` re-fetch)
2. Explicit-field webhook payloads (no `...body` spread)
3. `where`-respecting isolation mock with distinct uids
4. Empty-body guard on PUT/PATCH
5. `loadForm(id, ctxOrgId)` helper (exists + orgId + deleted)
6. **NEW for PR 6:** `formSubmissionRef(formId, formName)` synthetic actor on `/submit` writes

---

## File Structure

**Modified routes (5):**
- `app/api/v1/forms/route.ts` — GET viewer, POST admin + `createdByRef`/`updatedByRef`
- `app/api/v1/forms/[id]/route.ts` — GET viewer, PUT admin (slug-restriction preserved), DELETE admin (soft-delete + `?force=true` hard-delete preserved). `loadForm` helper.
- `app/api/v1/forms/[id]/submissions/route.ts` — GET viewer (read-only)
- `app/api/v1/forms/[id]/submissions/[subId]/route.ts` — GET viewer, PATCH admin (status update only). Add `updatedByRef`.
- `app/api/v1/forms/[id]/submit/route.ts` — **stays public**. No `withCrmAuth`. Add `createdByRef = formSubmissionRef(formId, form.name)` on FormSubmission write + on auto-created Contact + log Activity

**New test files (4 — none exist):**
- `__tests__/api/v1/forms/forms.test.ts`
- `__tests__/api/v1/forms/forms-id.test.ts`
- `__tests__/api/v1/forms/submissions.test.ts`
- `__tests__/api/v1/forms/submit.test.ts` (public flow + attribution)
- `__tests__/api/v1/forms/forms-tenant-isolation.test.ts`

**Constraint:** Zero `lib/*` changes.

---

## Tasks

### Task 1: Migrate `/forms` root + `[id]`

**Files:** `app/api/v1/forms/route.ts`, `app/api/v1/forms/[id]/route.ts`, NEW `__tests__/api/v1/forms/forms.test.ts` + `forms-id.test.ts`

**Role matrix:** GET viewer, POST admin (root). GET viewer, PUT admin, DELETE admin ([id]).

- [ ] Step 1: Read both routes + integrations Task 3 pattern (`d29975c`). Note: `[id]` PUT has slug-change restriction (only if no submissions exist) — preserve.

- [ ] Step 2: Write both test files with `stageAuth` (extend for `forms` collection). Tests:
  - viewer can GET list + GET by id (own org), cross-org → 404, soft-deleted → 404
  - admin POST writes `createdByRef`/`updatedByRef`, defaults applied (createContact=true, rateLimitPerMinute=10)
  - admin PUT updates name/title/fields, writes `updatedByRef`
  - admin PUT slug change BLOCKED when submissions exist (preserve existing check)
  - admin DELETE soft-deletes + `updatedByRef`; `?force=true` hard-deletes
  - member/viewer cannot POST/PUT/DELETE (403)
  - agent (Bearer) bypasses admin
  - Empty-body PUT → 400 (apply PR 5 lesson)

- [ ] Step 3: Run tests → fail.

- [ ] Step 4: Migrate. Create `loadForm(id, ctxOrgId)` helper in `[id]` route (mirror loadSegment/loadIntegration). Use `withCrmAuth` everywhere. `ctx.actor` directly. Sanitize. Apply empty-body guard on PUT.

  Preserve the slug-change restriction: load form, if `body.slug !== form.slug`, check `form_submissions where formId == id limit 1` — if any submission exists, return 400. Otherwise check slug uniqueness per org.

- [ ] Step 5: Run tests → pass.

- [ ] Step 6: Commit `feat(crm): migrate forms + forms/[id] routes to withCrmAuth + MemberRef attribution`

---

### Task 2: Migrate `/forms/[id]/submissions` + `[subId]`

**Files:** `app/api/v1/forms/[id]/submissions/route.ts`, `app/api/v1/forms/[id]/submissions/[subId]/route.ts`, NEW `__tests__/api/v1/forms/submissions.test.ts`

**Role matrix:** GET viewer (both routes). PATCH admin (subId only — status updates).

- [ ] Step 1: Read both routes. Note: subId GET includes cross-form-id validation (`formId === route formId`).

- [ ] Step 2: Write test file. Tests:
  - viewer can GET submissions list scoped to form + org
  - viewer can GET single submission by id; cross-form-id → 404
  - admin PATCH status (new/read/archived) writes `updatedByRef`
  - member cannot PATCH (403)
  - cross-tenant: viewer of org-A on org-B form's submissions → 404
  - status filter, date range filter, pagination preserved

- [ ] Step 3: Run tests → fail.

- [ ] Step 4: Migrate. `loadForm` from Task 1 for the parent form check. Submission-level GET adds: load form (via loadForm) → query submissions filtered by formId. PATCH: validate status enum + write `updatedByRef` + `updatedAt`.

- [ ] Step 5: Run tests → pass.

- [ ] Step 6: Commit `feat(crm): migrate forms submissions list + [subId] routes to withCrmAuth`

---

### Task 3: `/forms/[id]/submit` public route — add formSubmissionRef attribution

**Files:** `app/api/v1/forms/[id]/submit/route.ts`, NEW `__tests__/api/v1/forms/submit.test.ts`

**Role:** STAYS PUBLIC. No `withCrmAuth`. Existing form-key resolution + rate limit + Turnstile + honeypot preserved.

- [ ] Step 1: Read current route carefully. Note: form is resolved by `orgId + slug` query, not by `[id]` path param (despite the `[id]` folder name). Confirm.

- [ ] Step 2: Write test file. Tests:
  - public POST with valid form-key + valid data writes FormSubmission with `createdByRef = formSubmissionRef(formId, form.name)`
  - public POST creates Contact (when form.createContact=true) with `createdByRef = formSubmissionRef(...)` AND `createdBy: 'system:form-submission:{formId}'` (uid in the synthetic ref)
  - **One Activity also gets created** (`type: 'note'`, summary: `"Submitted form: {form.name}"`) with same `createdByRef`
  - honeypot field fills → silently 200 but no writes
  - rate limit exceeded → 429
  - Turnstile required + missing/invalid → 403
  - Form deleted/inactive → 404
  - Form not found by org+slug → 404
  - Webhook `form.submitted` still dispatched (preserve)

- [ ] Step 3: Run tests → fail.

- [ ] Step 4: Migrate. **Do NOT change auth.** Add these:
  - Import: `import { formSubmissionRef } from '@/lib/orgMembers/memberRef'`
  - When writing FormSubmission: add `createdByRef: formSubmissionRef(formId, form.name)`, `createdBy: 'system:form-submission:' + formId` (for query parity with normal records — though it's a synthetic uid)
  - When creating/upserting Contact (only if `form.createContact === true` AND submission has email): add same `createdByRef` + `createdBy`. **Important:** if upserting an existing contact, do NOT overwrite their `createdByRef` — only set on insert. Use a check like `if (!existingContact)` before adding the attribution.
  - Add an Activity write (if not present today): `type: 'note'`, `summary: 'Submitted form: ' + form.name`, `contactId: <linked contact>`, `metadata: { formId, submissionId }`, `createdByRef`, `createdBy: 'system:form-submission:' + formId`. Confirm by reading the route — if no Activity is currently written, ADD ONE. If one is written, just add attribution fields.

  Preserve existing webhook dispatch + sanitization.

- [ ] Step 5: Run tests → pass.

- [ ] Step 6: Commit `feat(crm): add formSubmissionRef attribution on public form submit route (Contact + Activity + FormSubmission)`

---

### Task 4: Cross-tenant isolation suite

**File:** Create `__tests__/api/v1/forms/forms-tenant-isolation.test.ts`

Mirror `capture-sources-integrations-tenant-isolation.test.ts` (`a735178`). Use `where`-respecting mock for `forms` + `form_submissions` + `contacts` collections.

Tests (~12):
- admin POST form scoped to org-a with createdByRef
- agent POST form uses AGENT_PIP_REF
- member POST form → 403
- viewer GET list returns only org-a forms (catches missing where('orgId'))
- admin cannot PUT cross-org form → 404
- admin cannot DELETE cross-org form → 404
- viewer GET cross-org form submissions → 404
- admin PATCH cross-org submission → 404
- **public /submit:** valid form-key writes FormSubmission with `formSubmissionRef`
- **public /submit:** auto-created Contact gets `formSubmissionRef` not a human ref
- **public /submit:** writes are scoped to form's org (verified via FormSubmission.orgId matches form.orgId)
- agent admin DELETE → 200 (bypasses admin gate)

Commit: `test(crm): consolidated cross-tenant isolation suite for forms routes (PR 6)`

---

### Task 5: Final verification + push

- [ ] Run full jest — all green
- [ ] Run build — clean
- [ ] Verify only PR 6 files touched
- [ ] Push: `git push origin main`
- [ ] Update wiki

---

## Ship Gate
- 4 auth routes migrated + 1 public route enhanced
- ~30-40 new tests
- `npm run build` clean
- Zero `lib/*` changes
- Manual smoke: submit a real form (via curl with form-key), verify FormSubmission + Contact both have `createdByRef.uid === 'system:form-submission:<formId>'`

---

## Risks + watch-outs

- **`/submit` route's contact upsert** — DON'T overwrite existing contact's attribution. Only set on first insert.
- **Activity write** — confirm whether one is currently written. If not, adding it could surprise consumers. Worth flagging in PR description.
- **Slug-change restriction** — keep the "no submissions allowed" check; PR 5 had a similar empty-body guard regression.
- **Forms have no `publicKey`** — original plan worried about `rotateKey` but audit confirmed there's no such concern.
- **`/submit` rate limiting** is per-IP — preserved verbatim.

---

## Next step

After PR 6 ships, **PR 7 (Quotes — 2 routes)** is the simplest remaining PR. Mirror PR 3 (Deals) structure. Then **PR 8 cleanup** (legacy `/api/v1/contacts/[id]/preferences` migration + remove unused `withAuth + resolveOrgScope` imports from CRM files + add consolidated final isolation test suite + skill doc updates).
