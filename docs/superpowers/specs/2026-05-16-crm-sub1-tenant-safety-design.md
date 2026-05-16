---
title: CRM Sub-1 — Tenant Safety + Identity Rewire (Design Spec)
date: 2026-05-16
status: approved
program: CRM per Client Workspace
sub_project: 1 of 3
prerequisite: settings-panel-and-workspace-profiles (shipped 2026-05-16)
next_step: writing-plans skill → implementation plan
---

# CRM Sub-1 — Tenant Safety + Identity Rewire

## Context

The Partners in Biz platform has a substantial CRM surface already shipped under `/api/v1/crm/*` plus adjacent surfaces (`/api/v1/forms/*`, `/api/v1/quotes/*`, `/api/v1/contacts/[id]/preferences`). It serves both PiB itself and 16 client orgs, multi-tenant by `orgId`.

Earlier today the [settings-panel-and-workspace-profiles](settings-panel-and-workspace-profiles.md) sprint shipped a new identity layer:
- `orgMembers/{orgId}_{uid}` collection — per-workspace profile (firstName, lastName, jobTitle, avatarUrl, role)
- `withPortalAuthAndRole(minRole, handler)` middleware in `lib/auth/portal-middleware.ts` — role-gated, reads from `orgMembers` with a fallback to `organizations.members[]`
- Permission toggles `membersCanDeleteContacts` / `membersCanExportContacts` on `organizations/{orgId}/settings.permissions`

The CRM still runs on the older `withAuth('client') + resolveOrgScope` stack. An audit (this session) confirmed:

| Finding | State |
|---|---|
| Tenant isolation on existing reads/writes | **Safe.** Every route filters by `orgId` resolved from `resolveOrgScope`. |
| `MemberRef` attribution on records | **Missing.** Only Activities store `createdBy: uid`. Contacts and Deals have no attribution at all. |
| Enforcement of `membersCanDeleteContacts` / `membersCanExportContacts` | **Missing.** Toggles exist but no CRM route consults them. |
| Cross-tenant isolation test coverage | **Missing.** Audit found none. |
| `capture_sources` composite index | **Missing.** |
| Deal write methods using `admin` role vs contacts using `client` | **Inconsistent.** |

This document specifies Sub-1: migrate every CRM-adjacent route to a unified `withCrmAuth` middleware that handles cookies + Bearer keys, embed `MemberRef` snapshots in every write, enforce the new permission toggles, and ship cross-tenant isolation tests as we go.

## Scope

**In scope** — ~25 route files across these surfaces:
- `/api/v1/crm/contacts` (root + `[id]` + `[id]/tags` + `[id]/activities` + `/import`)
- `/api/v1/crm/deals` (root + `[id]`)
- `/api/v1/crm/activities` (root)
- `/api/v1/crm/segments` (root + `[id]` + `preview` + `[id]/resolve`)
- `/api/v1/crm/capture-sources` (root + `[id]`)
- `/api/v1/crm/integrations` (root + `[id]` + `[id]/sync`)
- `/api/v1/forms` (root + `[id]` + `[id]/submissions` + `[id]/submissions/[subId]` — auth routes)
- `/api/v1/forms/[id]/submit` — public, special-cased
- `/api/v1/quotes` (root + `[id]`)
- `/api/v1/contacts/[id]/preferences` (legacy top-level)

**Out of scope** — explicitly Sub-2 or Sub-3:
- All portal/admin UI surfaces (`/portal/contacts`, etc.) — unchanged
- Unified contact-record timeline (Sub-2)
- Form-submission → enquiries → contacts consolidation (Sub-2)
- Pipeline kanban, lead scoring, contact merging, bulk ops, AI brief, saved views (Sub-3)
- `crm-sales` skill prompt rewrites beyond a header-requirement note

## Architecture

### Unified middleware — `withCrmAuth`

New file `lib/auth/crm-middleware.ts`. Single entry point for every CRM-adjacent route.

```typescript
type CrmRole = 'viewer' | 'member' | 'admin' | 'owner' | 'system'

interface CrmAuthContext {
  orgId: string
  actor: MemberRef               // human member OR synthetic agent
  role: CrmRole
  isAgent: boolean               // true when called via Bearer API key
  permissions: OrgPermissions    // from org.settings.permissions, pre-loaded
}

function withCrmAuth(
  minRole: Exclude<CrmRole, 'system'>,
  handler: (req: NextRequest, ctx: CrmAuthContext) => Promise<Response>
): RouteHandler
```

**Auth resolution order:**
1. **Cookie path** — `__session` cookie present → verify via `getAuth().verifySessionCookie` → extract `uid` + `activeOrgId` (or `orgId` fallback) → look up `orgMembers/{orgId}_{uid}` → assemble `MemberRef` from real member → enforce `minRole` against `ROLE_RANK`.
2. **Bearer path** — `Authorization: Bearer <key>` matches `AI_API_KEY` env var → require `X-Org-Id` header → role becomes `'system'` → `actor = AGENT_PIP_REF` → `permissions` still loaded so the route can branch on toggles if it wants, but `system` bypasses every `minRole` and every toggle check.
3. **Neither** → 401 `{ error: 'Unauthorized' }`.
4. **Cookie present but member doc missing for the active org** → 403 `{ error: 'Not a member of this workspace' }`. Falls back to `organizations.members[]` array first (matches the fallback in `withPortalAuthAndRole`).
5. **Role rank below `minRole`** → 403 `{ error: 'Insufficient role' }`.

`ROLE_RANK` is imported from `lib/orgMembers/types.ts` (single source of truth — already shipped). `system` sits above `owner`.

**Why not extend `withPortalAuthAndRole`:** that middleware is used by non-CRM portal routes (settings, dashboard) which don't need Bearer-key support. Keeping `withCrmAuth` separate avoids bleeding API-key concerns into the rest of the portal stack. Both middlewares share `resolveMemberRef` and `ROLE_RANK` so consistency is preserved.

### Identity types & helpers

New file `lib/orgMembers/memberRef.ts`:

```typescript
export interface MemberRef {
  uid: string
  displayName: string
  avatarUrl?: string
  jobTitle?: string
  kind: 'human' | 'agent' | 'system'
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

export function formSubmissionRef(formId: string, formName: string): MemberRef {
  return {
    uid: `system:form-submission:${formId}`,
    displayName: formName,
    kind: 'system',
  }
}

export async function resolveMemberRef(orgId: string, uid: string): Promise<MemberRef>
export async function snapshotForWrite(orgId: string, uid: string): Promise<MemberRef>
// snapshotForWrite throws if the member doc is missing — caller should never need
// a snapshot for a uid that isn't a real workspace member.
// resolveMemberRef returns a `{ uid, displayName: 'Former member', kind: 'system' }`
// fallback if the member doc is missing — used by the backfill script.
```

### Data model — Attribution extension

Every CRM record type gains optional attribution fields. Optional in TS so PR 1 can ship without backfill blocking; always written by new code from PR 2 onward.

```typescript
// lib/crm/types.ts additions
interface Attribution {
  createdAt: Timestamp
  createdBy?: string             // raw uid for queries (omitted for agent/system writes)
  createdByRef?: MemberRef       // snapshot for display
  updatedAt: Timestamp
  updatedBy?: string
  updatedByRef?: MemberRef
}

interface Contact extends Attribution {
  orgId: string
  // ...existing fields
  assignedTo?: string            // uid
  assignedToRef?: MemberRef      // written on assignment change
}

interface Deal extends Attribution {
  orgId: string
  ownerUid?: string              // who currently owns the deal
  ownerRef?: MemberRef
  // ...existing fields
}

interface Activity extends Attribution {
  orgId: string
  contactId: string
  // createdBy: uid stays as-is; createdByRef added
}

interface Segment extends Attribution { orgId: string; /* ... */ }
interface CaptureSource extends Attribution { orgId: string; /* ... */ }
interface Quote extends Attribution { orgId: string; /* ... */ }
interface Form extends Attribution { orgId: string; /* ... */ }
interface FormSubmission extends Attribution { orgId: string; formId: string; /* ... */ }
```

**Read-time fallback:** any record with missing/null `createdByRef` is rendered as `LEGACY_REF` in the UI. The fallback lives in `lib/crm/types.ts` as a `displayCreatedBy(record): MemberRef` helper; portal/admin components import it instead of accessing the field directly.

### Role matrix per route group

Source of truth — the value passed as `minRole` at each site. `system` (Bearer) bypasses everything.

| Route group | GET | POST | PATCH/PUT | DELETE | Permission gate |
|---|:---:|:---:|:---:|:---:|---|
| contacts | viewer | member | member | member | `membersCanDeleteContacts` on DELETE for member role |
| contacts/import | — | member | — | — | — |
| contacts/[id]/tags | — | member | — | member | — |
| contacts/[id]/activities | viewer | member | — | — | — |
| deals | viewer | member | member | admin | — |
| activities (root) | viewer | member | member-self / admin-other ¹ | member-self / admin-other ¹ | — |
| segments | viewer | admin | admin | admin | — |
| capture-sources | viewer | admin | admin | admin | — |
| integrations | admin | admin | admin | admin | — (encrypted creds) |
| forms (auth surfaces) | viewer | admin | admin | admin | — |
| forms/[id]/submit | (public) | (public) | — | — | — — uses `FORM_SUBMISSION_REF` for any contact it creates |
| quotes | viewer | member | member | admin | — |
| contacts/[id]/preferences (legacy) | viewer | — | member | — | — |

¹ **"own"** means `record.createdBy === ctx.actor.uid`. A `member` can edit/delete activities they created themselves; only `admin`+ can edit/delete activities created by others. `system` (Bearer) bypasses both. Implementation: route handler checks `if (ctx.role === 'member' && record.createdBy !== ctx.actor.uid) return 403`.

**Export endpoints** (when added in Sub-3) will consult `permissions.membersCanExportContacts`. Sub-1 doesn't add export but the middleware exposes `ctx.permissions` so callers can.

### Backfill script — `scripts/crm-backfill-attribution.ts`

Idempotent, batched, `--dry-run` by default.

**Targets:** `contacts`, `deals`, `activities`, `segments`, `capture_sources`, `quotes`, `forms`, `form_submissions` across all orgs.

**Per-record logic:**
1. If `createdByRef` already present → skip.
2. Else if `createdBy` uid present (Activities) → `resolveMemberRef(orgId, createdBy)` → write `createdByRef`. If `orgMembers` doc missing, fallback `{ uid: createdBy, displayName: 'Former member', kind: 'system' }`.
3. Else (Contacts, Deals, Segments, etc.) → write `LEGACY_REF`.
4. Same logic for `updatedByRef`: if `updatedBy` exists resolve it, else copy `createdByRef`.

**Output:** CSV report at `scripts/crm-backfill-reports/YYYY-MM-DD-HHMM.csv` with columns `collection`, `orgId`, `resolved_real_member`, `resolved_former_member`, `resolved_legacy`, `skipped_already_present`. Commit reports to git for audit trail.

**Flags:**
- `--dry-run` (default) — count what would change, write nothing
- `--commit` — actually write
- `--org-id <id>` — limit to one org
- `--collection <name>` — limit to one collection
- `--batch-size <n>` — default 200

**Run order on production:**
1. Deploy PR 1.
2. `npx tsx scripts/crm-backfill-attribution.ts --dry-run` — review CSV.
3. `npx tsx scripts/crm-backfill-attribution.ts --commit` — actual write.
4. Re-run `--dry-run` to confirm zero pending.
5. Then deploy PR 2 onward.

### Firestore indexes

Add to `firestore.indexes.json` (mind the `firestore.indexes` key gotcha — see [firestore-composite-indexes](firestore-composite-indexes.md)):

```
capture_sources:  orgId ASC + createdAt DESC          (missing today — fixes slow reads)
contacts:         orgId ASC + assignedTo ASC + updatedAt DESC   (new — enables "my contacts" view in Sub-3)
deals:            orgId ASC + ownerUid ASC + updatedAt DESC     (new — enables "my deals" view in Sub-3)
activities:       orgId ASC + createdBy ASC + createdAt DESC    (new — enables "my activities" filter)
```

Existing indexes from the audit (contacts orgId+createdAt, deals orgId+stage, deals orgId+createdAt, activities orgId+createdAt, activities contactId+createdAt, segments orgId+createdAt) all stay.

Deploy after PR 1 lands: `firebase deploy --only firestore:indexes` (pending Peet's firebase re-auth — same blocker as the Ads Phase 1 indexes).

## Migration Plan — 8 PRs

### PR 1 — Foundation (no behaviour change)
- `lib/auth/crm-middleware.ts` (`withCrmAuth`)
- `lib/orgMembers/memberRef.ts` (helpers + `AGENT_PIP_REF`, `LEGACY_REF`, `formSubmissionRef`)
- `lib/crm/types.ts` — add `Attribution` interface + extend all CRM types
- `lib/crm/displayCreatedBy.ts` — read-time fallback helper
- `scripts/crm-backfill-attribution.ts` + `scripts/crm-backfill-reports/.gitkeep`
- `firestore.indexes.json` — add 4 new indexes
- Tests: `__tests__/auth/crm-middleware.test.ts` — cookie path, Bearer path, role enforcement, missing `X-Org-Id`, missing member doc, fallback to `organizations.members[]`, agent bypass
- ~12 new files, no route files touched

**Ship gate:** middleware tests green, build clean, backfill dry-run produces sensible CSV against a snapshot of prod data.

### PR 2 — Contacts migration (5 routes)
`/api/v1/crm/contacts` root + `[id]` + `[id]/tags` + `[id]/activities` + `/contacts/import`.

For each: import `withCrmAuth`, swap from `withAuth + resolveOrgScope`, write `createdByRef` / `updatedByRef` / `assignedToRef` via `snapshotForWrite`. DELETE checks `ctx.permissions.membersCanDeleteContacts` when `ctx.role === 'member'`. Cross-tenant isolation tests added (recipe below).

**Ship gate:** isolation tests green, build clean, smoke: portal user creates/edits/deletes a contact, Firestore console shows `createdByRef` populated.

### PR 3 — Deals migration (2 routes)
`/api/v1/crm/deals` root + `[id]`. PATCH writes `ownerRef` when `ownerUid` changes. DELETE locked to `admin`. Isolation tests.

### PR 4 — Activities + Segments (5 routes)
Activities root: own-vs-other gate (member can edit/delete their own; admin can edit/delete anyone's). Segments root + `[id]` + `preview` + `[id]/resolve`: admin across the board. Isolation tests for both.

### PR 5 — Capture-sources + Integrations (5 routes)
Both admin-only. Integrations: encrypted creds writes stay routed through `lib/crm/integrations/store.ts` — middleware swap is purely auth. Isolation tests.

### PR 6 — Forms (5 routes — `/submit` is special-cased)
`/forms` root + `[id]` + `[id]/submissions` + `[id]/submissions/[subId]` → `withCrmAuth('admin')`.

`/forms/[id]/submit` keeps its existing anonymous validation (form-key, rate limit, captcha if configured). On the contact-create path it writes:
- `Contact.createdByRef = formSubmissionRef(formId, form.name)`
- `FormSubmission.createdByRef = formSubmissionRef(formId, form.name)`
- The resulting Activity (`type: 'note'`, "Submitted form: X") also gets `createdByRef = formSubmissionRef(...)`.

This means the UI in Sub-2 can show "Created from form: Newsletter Signup" in the timeline. Isolation tests for the auth surfaces; the public `/submit` gets its own attribution test (creates contact, asserts `createdByRef.uid === 'system:form-submission:{formId}'`).

### PR 7 — Quotes (2 routes)
Standard pattern. DELETE = admin, others = member. Isolation tests.

### PR 8 — Cleanup + final sweep
- `/contacts/[id]/preferences` migrated.
- Remove unused `withAuth + resolveOrgScope` imports from CRM files.
- Add `__tests__/crm/tenant-isolation.test.ts` — one consolidated suite that runs the standard recipe against every migrated route (regression net).
- Update agent-API SKILL docs (`/.claude/skills/crm-sales/SKILL.md`) to mention the `X-Org-Id` header requirement and the synthetic agent attribution. **Sync to mirrored path** per [reference_skill_file_locations](reference_skill_file_locations.md).
- Update `crm-foundation` wiki article with the final state.

## Test Pattern — Cross-tenant isolation recipe

Every migration PR includes one of these per route group it touches. Each test seeds two orgs, two members, and the relevant entity in each org. Assertions:

```typescript
describe('cross-tenant isolation: <route group>', () => {
  const ORG_A = 'org-a'; const ORG_B = 'org-b'
  const MEMBER_A_UID = 'uid-a'; const MEMBER_B_UID = 'uid-b'

  beforeAll(async () => {
    await seedOrgMember(ORG_A, MEMBER_A_UID, { role: 'member' })
    await seedOrgMember(ORG_B, MEMBER_B_UID, { role: 'member' })
    await seedContact(ORG_A, { id: 'a1' })   // or seedDeal, seedActivity, etc.
    await seedContact(ORG_B, { id: 'b1' })
  })

  it('member of A cannot read org B list', async () => { /* GET returns no b1 */ })
  it('member of A gets 404 on org B record by id', async () => { /* GET /b1 → 404 */ })
  it('member of A cannot write org B record', async () => { /* PATCH /b1 → 404 */ })
  it('Bearer key for org A only sees org A list', async () => { /* GET via Bearer + X-Org-Id: A */ })
  it('createdByRef written on POST', async () => { /* POST then assert field */ })
  it('agent role bypasses delete toggle', async () => { /* Bearer DELETE succeeds even when toggle off */ })
  it('member DELETE blocked when toggle off', async () => { /* 403 */ })
})
```

Helpers (`seedOrgMember`, `seedContact`, `callAsMember`, `callAsAgent`) live in `__tests__/helpers/crm.ts` — shipped in PR 1.

## Ship Gates Summary

| PR | Tests | Build | Manual smoke |
|---|---|---|---|
| 1 | middleware suite green | clean | backfill `--dry-run` CSV reviewed |
| 2-7 | isolation suite green for migrated routes | clean | portal create/edit/delete works; `createdByRef` populated in Firestore |
| 8 | full consolidated isolation suite green | clean | Bearer-key `list contacts` for arbitrary org via Pip skill still works |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Two middlewares in production for ~1-2 weeks could confuse contributors | Migration checklist in `docs/superpowers/plans/2026-05-16-crm-sub1-phase1-foundation.md`. PR 8 removes the second pattern. |
| Backfill writes a wrong default to a record that had a real creator | Idempotency: backfill never overwrites an existing `createdByRef`. `--dry-run` is the default. Per-collection CSV review before `--commit`. |
| Bearer-key callers forget `X-Org-Id` header → 401 in production | PR 8 SKILL doc update + add `X-Org-Id` to all skill examples. Middleware error returns explicit `'Missing X-Org-Id header'` body. |
| Firestore indexes deploy is blocked on Peet's firebase re-auth | Indexes commit in PR 1 and stay committed; queries that need them fall back to in-memory sort until deploy lands (same pattern as invoices fix on 2026-05-06). |
| `withPortalAuthAndRole` and `withCrmAuth` drift on role logic | Both import `ROLE_RANK` and `resolveMemberRef` from shared modules. Linter rule (or PR review checklist) to forbid inline role rank tables. |
| Form `/submit` public endpoint becomes a contact-create vector for unauthenticated traffic | Existing form-key + rate-limit + optional captcha already cover this. `FORM_SUBMISSION_REF` makes the attribution honest in the UI. No new attack surface. |

## Decisions log (locked during brainstorming)

1. **Decomposition:** 3 sub-projects (tenant safety → consolidation → features). Sub-1 first.
2. **Primary user:** Both — same code, different orgs. Multi-tenant by `orgId`.
3. **Auth model:** Unified middleware (cookie + Bearer + role) — `withCrmAuth`.
4. **Bearer attribution:** Synthetic `agent:pip` actor with `kind: 'agent'`. No human masquerade.
5. **Backfill:** Script + `LEGACY_REF` fallback. UI surfaces "Imported" badge on legacy records. No false attribution.
6. **Scope:** Everything CRM-adjacent — `/crm/*` + `/forms/*` + `/quotes/*` + legacy `/contacts/[id]/preferences`.
7. **Rollout:** Approach B — middleware-first foundation PR, then route-by-route in 7 follow-up PRs.
8. **Attribution requirement:** Optional in TS, always written in new code. Backfill not blocking for routes.

## Next step

Invoke `superpowers:writing-plans` to produce the PR 1 (Foundation) implementation plan. Subsequent PRs (2-8) get their own plans as they're picked up.

## Related

- [settings-panel-and-workspace-profiles](settings-panel-and-workspace-profiles.md) — prerequisite, shipped today
- [crm-foundation](crm-foundation.md) — earlier guide; this spec supersedes its proposed schemas
- [firestore-composite-indexes](firestore-composite-indexes.md) — index gotcha
- [reference_skill_file_locations](reference_skill_file_locations.md) — skill sync path
- [agent-api-skills](agent-api-skills.md) — Bearer-key consumer contract
