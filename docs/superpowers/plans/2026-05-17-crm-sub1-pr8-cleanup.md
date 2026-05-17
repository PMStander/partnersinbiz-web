# CRM Sub-1 PR 8 — Cleanup & Final Sweep Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Final PR of CRM Sub-1. Migrate the last remaining legacy route, update skill docs for role changes, standardize DELETE response shapes, and formally document the `withIdempotency` decision. After PR 8 ships, every CRM-adjacent route uses `withCrmAuth` and the tenant-safety program is complete.

**Audit findings (the surface is much smaller than expected):**
- `app/api/v1/contacts/[id]/preferences/route.ts` is the **only** remaining CRM-adjacent route on legacy auth
- Zero `withAuth + resolveOrgScope` references survive in `/crm/*`, `/forms/*`, `/quotes/*`
- Zero `withIdempotency` references remain across CRM (PR 6 review flagged this — PR 8 decides: formally drop, don't restore)
- `crm-sales/SKILL.md` has stale role docs for deals/quotes/forms GET (says admin, actually viewer) and POST (says admin, actually member)
- DELETE response envelopes drift: contacts/quotes return `{ id }`; forms returns `{ id, deleted: true }`. Standardize on `{ id }`.

**Base SHA:** `8ab7127` (PR 7 ship). **Working dir:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## File Structure

**Modified files (4):**
- `app/api/v1/contacts/[id]/preferences/route.ts` — migrate to `withCrmAuth`
- `app/api/v1/forms/[id]/route.ts` — DELETE response: drop `deleted: true` flag (standardize on `{ id }`)
- `.claude/skills/crm-sales/SKILL.md` — role matrix corrections + `withIdempotency` decision note + response shape note
- (Also potentially sync to `~/Cowork/.claude/skills/crm-sales/` if symlinked — verify)

**New tests (1):**
- `__tests__/api/v1/contacts/contacts-id-preferences.test.ts` (new — none exist)

**Constraint:** Zero `lib/*` changes.

---

## Tasks

### Task 1: Migrate `/api/v1/contacts/[id]/preferences/route.ts`

**Files:** `app/api/v1/contacts/[id]/preferences/route.ts`, NEW `__tests__/api/v1/contacts/contacts-id-preferences.test.ts`

**Role matrix:** GET viewer, PUT member. No DELETE.

- [ ] Step 1: Read current route. Note: writes contact preferences (email topics, frequency); reads from contact doc, writes back preferences sub-object.

- [ ] Step 2: Create test file with `stageAuth` pattern (mirror `__tests__/api/v1/forms/forms-id.test.ts` from PR 6). Tests:
  - viewer can GET preferences (own org), cross-org → 404
  - viewer cannot PUT → 403
  - member PUT updates preferences, writes `updatedByRef`
  - agent (Bearer) PUT uses AGENT_PIP_REF
  - empty body → 400 (apply empty-body guard)
  - invalid topics array → 400
  - cross-org PUT → 404

- [ ] Step 3: Run tests → fail.

- [ ] Step 4: Migrate. Use `withCrmAuth<RouteCtx>('viewer'/'member', ...)`. Add tenant isolation 404. Preserve existing preferences validation. Write `updatedByRef`/`updatedBy` + sanitize.

- [ ] Step 5: Run tests → pass.

- [ ] Step 6: Commit `feat(crm): migrate legacy contacts/[id]/preferences to withCrmAuth (final route migration)`

---

### Task 2: Standardize DELETE response shape

**File:** `app/api/v1/forms/[id]/route.ts`

Current: `apiSuccess({ id, deleted: true })`. Standardize to `apiSuccess({ id })` (matches contacts/quotes). Update the relevant tests in `__tests__/api/v1/forms/forms-id.test.ts` to drop the `deleted: true` assertion.

- [ ] Read forms `[id]` DELETE handler + test file
- [ ] Change response to `apiSuccess({ id })`
- [ ] Update existing tests' DELETE assertions (drop `expect(body.data.deleted).toBe(true)` — keep `expect(body.data.id).toBe(...)`)
- [ ] Run forms suite → pass
- [ ] Commit `fix(forms): standardize DELETE response to { id } (match contacts/quotes pattern)`

---

### Task 3: Update `crm-sales` SKILL.md

**File:** `.claude/skills/crm-sales/SKILL.md`

Per the audit, stale role docs across deals, quotes, and forms:

| Route | OLD docs | NEW correct |
|---|---|---|
| `GET /crm/deals` | admin | viewer |
| `POST /crm/deals` | admin | member |
| `PUT /crm/deals/[id]` | admin | member |
| `DELETE /crm/deals/[id]` | admin | admin (unchanged) |
| `GET /quotes` | admin | viewer |
| `POST /quotes` | admin | member |
| `PATCH /quotes/[id]` | admin | member |
| `DELETE /quotes/[id]` | admin | admin (unchanged) |
| `GET /forms` | admin | viewer |
| `POST /forms` | admin | admin (unchanged) |
| `GET /forms/[id]` | admin | viewer |
| `GET /forms/[id]/submissions` | admin | viewer |
| `GET /forms/[id]/submissions/[subId]` | admin | viewer |
| `PATCH /forms/[id]/submissions/[subId]` | admin | admin (unchanged) |

Also add:
- **`withIdempotency` decision note** under an `## Idempotency` section: "CRM POST routes do NOT honour an `Idempotency-Key` header. Duplicate POSTs may create duplicate records. Mitigations: quote numbering is atomic (no duplicate quote numbers under concurrency); form slugs are unique per org; form submissions are deduped on the public `/submit` route only via IP rate-limiting. For contacts/deals/segments/integrations/capture-sources, retry your POST only if you can confirm it didn't already succeed (check the create response or query for the record)."
- **DELETE response shape note**: "All CRM DELETE endpoints return `{ id }` on success (200). Forms previously returned `{ id, deleted: true }` (PR 8 standardized)."
- **`formSubmissionRef` note** in the Forms section: "Public `/forms/[id]/submit` writes `createdByRef = formSubmissionRef(formId, formName)` on the FormSubmission, the auto-created Contact (insert only — existing Contact is preserved), and the resulting Activity."

- [ ] Read current SKILL.md
- [ ] Apply role matrix corrections to the affected route sections
- [ ] Add `## Idempotency`, `## DELETE response shape`, and update Forms section with formSubmissionRef paragraph
- [ ] Verify symlink: `ls -la ~/Cowork/.claude/skills/crm-sales/SKILL.md` — if it's a symlink to this file, sync happens automatically. If it's a separate copy, run the platform-skills install script (see `scripts/install-platform-skills.sh` if it exists).
- [ ] Commit `docs(crm-sales-skill): update role matrix for deals/quotes/forms downgrades + idempotency + DELETE shape notes`

---

### Task 4: Final verification + push

- [ ] Full suite green
- [ ] Build clean
- [ ] **Sub-1 done check:** `grep -rn "withAuth\b\|resolveOrgScope\b" app/api/v1/crm app/api/v1/forms app/api/v1/quotes app/api/v1/contacts/` → must be ZERO matches (preferences was the last one)
- [ ] **Sub-1 stats summary:** total CRM route count migrated, total test count delta (PR 1 start vs PR 8 end)
- [ ] Push: `git push origin main`
- [ ] Tag the milestone: `git tag crm-sub1-complete && git push origin crm-sub1-complete`
- [ ] Update wiki + session log: **Sub-1 COMPLETE**

---

## Ship Gate

- 1 route migrated (preferences)
- Forms DELETE response standardized
- SKILL.md updated for all role downgrades + idempotency policy + DELETE shape
- Zero `withAuth + resolveOrgScope` references across CRM
- Tag `crm-sub1-complete` pushed to origin
- Sub-1 marked COMPLETE in wiki

---

## Sub-1 final stats (target)

After PR 8 ships:
- **8 PRs shipped** (Foundation + 6 migration + Cleanup)
- **26 CRM routes** on `withCrmAuth` + 1 public `/submit` with `formSubmissionRef`
- **~280+ new CRM tests**
- **Zero `lib/*` regressions** — encryption, sync handlers, atomic numbering all preserved
- **Zero legacy `withAuth + resolveOrgScope` references** across CRM after PR 8

---

## Next program (Sub-projects 2-3, future PRs)

Spec mentioned 3 sub-projects:
- **Sub-1 (tenant safety + identity rewire)** — DONE after PR 8
- **Sub-2 (consolidation)** — unify scattered surfaces (contacts/deals/forms/enquiries/quotes/segments/capture-sources) into one coherent workspace CRM experience. One contact timeline pulling from all sources.
- **Sub-3 (missing CRM features)** — pipeline kanban, lead scoring, multi-pipeline, contact merging, AI brief, etc.

After PR 8 ships, brainstorm Sub-2 vs Sub-3 priorities based on user need.
